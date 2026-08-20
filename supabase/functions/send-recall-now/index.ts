import { authorizeOwnerOrSuperAdmin } from "../_shared/auth.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { getIstNow } from "../_shared/ist-time.ts";
import { sendOneRecallMessage, type ClinicForSend, type RecallRow } from "../send-recall-messages/send.ts";
import { validateSendRecallNowRequest, type SendRecallNowRequest } from "./validate.ts";

Deno.serve(async (req) => {
  // Per-request origin echo (allow-listed to the production frontend + local Vite dev server),
  // not the shared static corsHeaders -- this is a browser-invoked, owner-triggered button that
  // genuinely needs to work from localhost during development, unlike send-recall-messages/
  // whatsapp-webhook which are never called from a browser at all.
  const cors = corsHeadersForRequest(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  // Same auth chain as send-test-message: verified JWT, active profile, role IN ('owner',
  // 'super_admin'). This is a user-invoked demo trigger reachable from the browser, so it is
  // gated by the caller's own Supabase session -- never by CRON_SECRET, which belongs only to
  // send-recall-messages and must never reach client code.
  const auth = await authorizeOwnerOrSuperAdmin(req);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status, cors);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }

  const validationErrors = validateSendRecallNowRequest(body);
  if (validationErrors) {
    return json({ error: "Validation failed", fields: validationErrors }, 400, cors);
  }
  const input = body as SendRecallNowRequest;
  const { serviceClient } = auth;

  // Fetch the recall + patient + visit in one shot -- same shape sendOneRecallMessage already
  // expects from the cron path, so nothing downstream needs to know this send was manual.
  const { data: recall, error: recallError } = await serviceClient
    .from("recalls")
    .select(
      `id, clinic_id, patient_id, due_date, attempt_count, last_attempt_at,
       patients!inner(name, mobile, is_active, do_not_disturb),
       visits(visit_date, treatment_types(name))`,
    )
    .eq("id", input.recall_id)
    .maybeSingle();

  if (recallError || !recall) {
    return json({ error: "Recall not found" }, 404, cors);
  }

  // Containment: an owner may only trigger a send for a recall inside their own clinic. Returning
  // the same 404 for "doesn't exist" and "belongs to another clinic" keeps cross-tenant existence
  // unconfirmable, same principle the webhook handler follows -- never guess, never leak.
  if (auth.role === "owner" && recall.clinic_id !== auth.clinicId) {
    return json({ error: "Recall not found" }, 404, cors);
  }

  const patient = recall.patients as unknown as { name: string; mobile: string; is_active: boolean; do_not_disturb: boolean };
  if (!patient.is_active) {
    return json({ error: "This patient is marked inactive" }, 400, cors);
  }
  if (patient.do_not_disturb) {
    return json({ error: "This patient has do-not-disturb enabled" }, 400, cors);
  }

  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  if (!accessToken) {
    console.error("META_ACCESS_TOKEN is not configured");
    return json({ error: "Server misconfigured" }, 500, cors);
  }

  const { data: clinic, error: clinicLoadError } = await serviceClient
    .from("clinics")
    .select("id, name, phone, waba_phone_number_id, whatsapp_enabled, is_active, plan_expires_on, monthly_message_quota")
    .eq("id", recall.clinic_id)
    .single();
  if (clinicLoadError || !clinic) {
    return json({ error: "Clinic not found" }, 404, cors);
  }
  if (!clinic.whatsapp_enabled) {
    return json({ error: "WhatsApp sending is not enabled for this clinic" }, 400, cors);
  }
  if (!clinic.is_active) {
    return json({ error: "This clinic is not active" }, 400, cors);
  }
  const { dateStr } = getIstNow();
  if (clinic.plan_expires_on < dateStr) {
    return json({ error: "This clinic's plan has expired" }, 400, cors);
  }
  if (!clinic.waba_phone_number_id) {
    return json({ error: "This clinic has no WABA phone number configured" }, 400, cors);
  }

  const { data: template, error: templateError } = await serviceClient
    .from("whatsapp_templates")
    .select("meta_template_name, language_code, variable_mapping")
    .eq("clinic_id", clinic.id)
    .eq("is_default", true)
    .eq("approval_status", "approved")
    .maybeSingle();
  if (templateError || !template) {
    return json({ error: "This clinic has no approved default template" }, 400, cors);
  }

  // Billed by Meta exactly like any other send, so the same hard monthly ceiling applies -- a
  // manual demo trigger must never be a way around the clinic's quota.
  const monthStart = `${dateStr.slice(0, 7)}-01`;
  const { data: usage } = await serviceClient
    .from("clinic_usage")
    .select("messages_sent")
    .eq("clinic_id", clinic.id)
    .eq("month", monthStart)
    .maybeSingle();
  if ((usage?.messages_sent ?? 0) >= clinic.monthly_message_quota) {
    return json({ error: "This clinic has reached its monthly message quota" }, 400, cors);
  }

  // Deliberately bypasses two things the cron loop enforces and this doesn't: the due_date filter
  // (the whole point of this button -- send this specific recall right now, whatever its due_date
  // is) and the same-day idempotency guard (that guard exists to stop the hourly cron from
  // re-sending a recall it already reached earlier the same day; it has no meaning for a single
  // explicit click). Everything downstream of the actual API call -- message_log, recalls'
  // status/attempt_count/next_retry_date ladder, clinic_usage -- goes through sendOneRecallMessage,
  // the exact function the cron path uses, so none of that can drift between the two triggers.
  const clinicForSend: ClinicForSend = {
    id: clinic.id,
    name: clinic.name,
    phone: clinic.phone,
    waba_phone_number_id: clinic.waba_phone_number_id,
  };
  const result = await sendOneRecallMessage(
    serviceClient,
    clinicForSend,
    template,
    recall as unknown as RecallRow,
    dateStr,
    accessToken,
    monthStart,
  );

  if (result.ok) {
    return json({ success: true, wa_message_id: result.waMessageId, recall_id: input.recall_id }, 200, cors);
  }
  // Meta's exact error is returned unmodified -- the caller needs the real error to diagnose a
  // WABA/template config problem, not a generic "send failed" message.
  return json(
    { success: false, error_code: result.errorCode, error_message: result.errorMessage, recall_id: input.recall_id },
    200,
    cors,
  );
});
