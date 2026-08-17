import { authorizeOwnerOrSuperAdmin } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { buildTemplateMessage, callGraphApi } from "../_shared/whatsapp-graph-api.ts";
import { incrementMessagesSent } from "../_shared/clinic-usage.ts";
import { getIstNow } from "../_shared/ist-time.ts";
import { validateSendTestMessageRequest, type SendTestMessageRequest } from "./validate.ts";

/** Guardrail against looping this button to burn a clinic's real, Meta-billed monthly quota --
 * unlike send-recall-messages (throttled to once/hour by the cron itself), this endpoint fires
 * on demand from the browser the moment someone clicks "Send Test Message". */
const TEST_SENDS_PER_HOUR_LIMIT = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Steps 1-3: verified JWT, active profile, role IN ('owner', 'super_admin') -- identical chain
  // to create-staff-user. This is a user-invoked endpoint reachable from the browser, so it is
  // deliberately gated by the caller's own Supabase session, never by CRON_SECRET -- that secret
  // belongs only to send-recall-messages and must never reach client code.
  const auth = await authorizeOwnerOrSuperAdmin(req);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const validationErrors = validateSendTestMessageRequest(body);
  if (validationErrors) {
    return json({ error: "Validation failed", fields: validationErrors }, 400);
  }
  const input = body as SendTestMessageRequest;
  const { serviceClient } = auth;

  // Containment: an owner's clinic comes ONLY from their own verified profile, never from the
  // request body -- so a clinic_id in the body is silently ignored for an owner, not honoured
  // and not treated as an error. A super_admin may target any clinic, but only one that exists.
  let clinicId: string;
  if (auth.role === "owner") {
    clinicId = auth.clinicId as string;
  } else {
    if (typeof input.clinic_id !== "string" || !input.clinic_id) {
      return json({ error: "Validation failed", fields: { clinic_id: "clinic_id is required" } }, 400);
    }
    const { data: clinicRow, error: clinicIdError } = await serviceClient
      .from("clinics")
      .select("id")
      .eq("id", input.clinic_id)
      .maybeSingle();
    if (clinicIdError || !clinicRow) {
      return json(
        { error: "Validation failed", fields: { clinic_id: "clinic_id does not refer to an existing clinic" } },
        400,
      );
    }
    clinicId = clinicRow.id;
  }

  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  if (!accessToken) {
    console.error("META_ACCESS_TOKEN is not configured");
    return json({ error: "Server misconfigured" }, 500);
  }

  const { data: clinic, error: clinicLoadError } = await serviceClient
    .from("clinics")
    .select("id, name, phone, waba_phone_number_id, monthly_message_quota")
    .eq("id", clinicId)
    .single();
  if (clinicLoadError || !clinic) {
    return json({ error: "Clinic not found" }, 404);
  }
  if (!clinic.waba_phone_number_id) {
    return json({ error: "This clinic has no WABA phone number configured" }, 400);
  }

  const { data: template, error: templateError } = await serviceClient
    .from("whatsapp_templates")
    .select("meta_template_name, language_code, variable_mapping")
    .eq("clinic_id", clinicId)
    .eq("is_default", true)
    .eq("approval_status", "approved")
    .maybeSingle();
  if (templateError || !template) {
    return json({ error: "This clinic has no approved default template" }, 400);
  }

  // Rate limit: max 5 test sends per clinic per hour, counted from message_log itself (is_test =
  // true rows), not a separate counter -- so it can't drift from what actually got logged. A
  // plain count-then-compare, same rigor as the seat-limit check elsewhere in this codebase; a
  // true race between two simultaneous clicks isn't worth a DB-level lock for a manual UI action.
  const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentTestSendCount, error: rateLimitError } = await serviceClient
    .from("message_log")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("is_test", true)
    .gte("created_at", oneHourAgoIso);
  if (rateLimitError) {
    return json({ error: "Could not verify the test-send rate limit" }, 500);
  }
  if ((recentTestSendCount ?? 0) >= TEST_SENDS_PER_HOUR_LIMIT) {
    return json(
      { error: `Test message limit reached (${TEST_SENDS_PER_HOUR_LIMIT} per hour). Please try again later.` },
      429,
    );
  }

  // Test sends are billed by Meta exactly like a real recall send, so they must count against
  // the same monthly quota -- checked before sending, same as send-recall-messages.
  const { dateStr } = getIstNow();
  const monthStart = `${dateStr.slice(0, 7)}-01`;
  const { data: usage } = await serviceClient
    .from("clinic_usage")
    .select("messages_sent")
    .eq("clinic_id", clinicId)
    .eq("month", monthStart)
    .maybeSingle();
  const messagesSentThisMonth = usage?.messages_sent ?? 0;
  if (messagesSentThisMonth >= clinic.monthly_message_quota) {
    return json({ error: "This clinic has reached its monthly message quota" }, 400);
  }

  // There's no real recall behind a test send, so the template is rendered with generic
  // placeholder values instead of real patient/visit data.
  const placeholderFields: Record<string, string> = {
    patient_name: "Test Patient",
    treatment_name: "Sample Treatment",
    visit_date: dateStr,
    clinic_phone: clinic.phone ?? "",
    clinic_name: clinic.name,
  };
  const message = buildTemplateMessage(input.mobile, template, placeholderFields);

  // Inserted before the API call, in 'queued' status, so a crash mid-call still leaves a trace --
  // and is_test = true from the start, so it never gets counted as a real send even if something
  // downstream fails before the final status update.
  const { data: logRow, error: logInsertError } = await serviceClient
    .from("message_log")
    .insert({
      clinic_id: clinicId,
      recall_id: null,
      patient_id: null,
      mobile: input.mobile,
      template_name: template.meta_template_name,
      status: "queued",
      is_test: true,
    })
    .select("id")
    .single();
  if (logInsertError || !logRow) {
    return json({ error: "Failed to record the test send attempt" }, 500);
  }

  const result = await callGraphApi(clinic.waba_phone_number_id, accessToken, message);
  const nowIso = new Date().toISOString();

  if (result.ok) {
    await serviceClient
      .from("message_log")
      .update({ status: "sent", wa_message_id: result.waMessageId, sent_at: nowIso })
      .eq("id", logRow.id);

    await incrementMessagesSent(serviceClient, clinicId, monthStart);

    return json(
      { success: true, wa_message_id: result.waMessageId, mobile: input.mobile, template_name: template.meta_template_name },
      200,
    );
  }

  await serviceClient
    .from("message_log")
    .update({ status: "failed", error_code: result.errorCode, error_message: result.errorMessage })
    .eq("id", logRow.id);

  // Meta's exact error is returned unmodified -- the caller needs the real error to diagnose a
  // WABA/template config problem, not a generic "send failed" message.
  return json({ success: false, error_code: result.errorCode, error_message: result.errorMessage }, 200);
});
