import { authorizeOwnerOrReceptionist } from "../_shared/auth.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { getIstNow, combineIstInstant } from "../_shared/ist-time.ts";
import { buildTemplateMessage, callGraphApi, type WhatsappTemplate } from "../_shared/whatsapp-graph-api.ts";
import { incrementMessagesSent, getMonthlyMessagesSent, countMessagesSentToday } from "../_shared/clinic-usage.ts";
import { fetchPatientBilling, formatAmountForWhatsapp } from "../send-recall-messages/send.ts";
import { validateSendPaymentMessageRequest, type SendPaymentMessageRequest } from "./validate.ts";

/** The one payment-update template this phase supports, hardcoded rather than looked up via
 * is_default (that flag is reserved for the clinic's recall template -- see Phase 30A Task 1;
 * payment_update_nanda_dental is deliberately never marked default so it's never picked up by the
 * automatic recall cron). Onboarding a second clinic onto this endpoint will need a real
 * "which template serves payment updates for this clinic" column -- out of scope for this
 * Nanda-only rollout. */
const PAYMENT_TEMPLATE_NAME = "payment_update";

Deno.serve(async (req) => {
  // Per-request origin echo, same as every other browser-invoked, staff-triggered function
  // (send-recall-now, send-test-message) -- this is never called by cron or by Meta.
  const cors = corsHeadersForRequest(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  // Steps 1-3: verified JWT, active profile, role IN ('owner', 'receptionist'). Unlike every other
  // manual-send function in this codebase (which are owner/super_admin only), this one is meant
  // to be used from the patient record a receptionist is already looking at -- branch containment
  // for a receptionist is enforced below, once the target patient is loaded.
  const auth = await authorizeOwnerOrReceptionist(req);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status, cors);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }

  const validationErrors = validateSendPaymentMessageRequest(body);
  if (validationErrors) {
    return json({ error: "Validation failed", fields: validationErrors }, 400, cors);
  }
  const input = body as SendPaymentMessageRequest;
  const { serviceClient } = auth;

  // clinic_id/branch_id are never trusted from the request body -- the target patient's own row
  // is the only source of truth, exactly like send-recall-now's recall lookup.
  const { data: patient, error: patientError } = await serviceClient
    .from("patients")
    .select("id, clinic_id, branch_id, name, mobile, do_not_disturb")
    .eq("id", input.patient_id)
    .maybeSingle();

  if (patientError || !patient) {
    return json({ error: "Patient not found" }, 404, cors);
  }

  // Containment: same shape as visits_insert's RLS predicate -- an owner may act on any branch of
  // their own clinic, a receptionist only on their own branch. Cross-clinic is reported as 404
  // (existence-hiding, matching send-recall-now); cross-branch-within-clinic is a real 403.
  if (patient.clinic_id !== auth.clinicId) {
    return json({ error: "Patient not found" }, 404, cors);
  }
  if (auth.role === "receptionist" && patient.branch_id !== auth.branchId) {
    return json({ error: "Forbidden: this patient is outside your branch" }, 403, cors);
  }

  // Idempotency: a retry carrying the same client_request_id (the caller generates one per
  // dialog-open and reuses it across retries, never regenerating it here) is treated as an
  // already-sent success regardless of what the first attempt's outcome was -- mirrors the
  // patient_payments/prescriptions/visits pattern (idx_..._client_request_id), just checked
  // up front here instead of relying solely on the unique-violation path, since a repeat call
  // must never re-contact Meta at all.
  const { data: existingLog } = await serviceClient
    .from("message_log")
    .select("id, wa_message_id, status")
    .eq("clinic_id", patient.clinic_id)
    .eq("client_request_id", input.client_request_id)
    .maybeSingle();
  if (existingLog) {
    return json(
      { success: true, already_sent: true, wa_message_id: existingLog.wa_message_id, patient_id: patient.id },
      200,
      cors,
    );
  }

  // Guard 1/6: PATIENT_DND -- not overridable from this endpoint, full stop.
  if (patient.do_not_disturb) {
    return json({ error: "This patient has do-not-disturb enabled", error_code: "PATIENT_DND" }, 400, cors);
  }

  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  if (!accessToken) {
    console.error("META_ACCESS_TOKEN is not configured");
    return json({ error: "Server misconfigured" }, 500, cors);
  }

  const { data: clinic, error: clinicError } = await serviceClient
    .from("clinics")
    .select("id, name, phone, waba_phone_number_id, whatsapp_enabled, is_active, plan_expires_on, daily_message_cap, monthly_message_quota")
    .eq("id", patient.clinic_id)
    .single();
  if (clinicError || !clinic) {
    return json({ error: "Clinic not found" }, 404, cors);
  }

  // Guard 2/6: WHATSAPP_DISABLED
  if (!clinic.whatsapp_enabled) {
    return json({ error: "WhatsApp sending is not enabled for this clinic", error_code: "WHATSAPP_DISABLED" }, 400, cors);
  }

  const { dateStr } = getIstNow();

  // Guard 3/6: CLINIC_SUSPENDED
  if (!clinic.is_active || clinic.plan_expires_on < dateStr) {
    return json({ error: "This clinic is suspended or its plan has expired", error_code: "CLINIC_SUSPENDED" }, 400, cors);
  }

  if (!clinic.waba_phone_number_id) {
    return json({ error: "This clinic has no WABA phone number configured" }, 400, cors);
  }

  // Guard 4/6: DAILY_CAP_EXCEEDED -- counted directly from message_log for the current IST
  // calendar day (see countMessagesSentToday's doc comment for why this differs mechanically from
  // send-recall-messages' in-memory per-run counter while enforcing the same rule).
  const todayStartIso = combineIstInstant(dateStr, "00:00:00").toISOString();
  const sentToday = await countMessagesSentToday(serviceClient, clinic.id, todayStartIso);
  if (sentToday >= clinic.daily_message_cap) {
    return json({ error: "This clinic has reached its daily message cap", error_code: "DAILY_CAP_EXCEEDED" }, 400, cors);
  }

  // Guard 5/6: MONTHLY_QUOTA_EXCEEDED -- same clinic_usage read as the cron/send-recall-now paths.
  const monthStart = `${dateStr.slice(0, 7)}-01`;
  const messagesSentThisMonth = await getMonthlyMessagesSent(serviceClient, clinic.id, monthStart);
  if (messagesSentThisMonth >= clinic.monthly_message_quota) {
    return json({ error: "This clinic has reached its monthly message quota", error_code: "MONTHLY_QUOTA_EXCEEDED" }, 400, cors);
  }

  // Guard 6/6: TEMPLATE_MISSING
  const { data: templateRow, error: templateError } = await serviceClient
    .from("whatsapp_templates")
    .select("meta_template_name, language_code, variable_mapping")
    .eq("clinic_id", clinic.id)
    .eq("meta_template_name", PAYMENT_TEMPLATE_NAME)
    .eq("approval_status", "approved")
    .maybeSingle();
  if (templateError || !templateRow) {
    return json({ error: "This clinic has no approved payment-update template", error_code: "TEMPLATE_MISSING" }, 400, cors);
  }
  const template = templateRow as WhatsappTemplate;

  // Same patient_billing_summary view the recall path and the patient detail page's BillingBanner
  // read -- never a second, independently-summed query.
  const billing = await fetchPatientBilling(serviceClient, patient.id);
  const trimmedClinicName = clinic.name?.trim() ?? "";
  const trimmedPatientName = patient.name?.trim() ?? "";

  // Field keys match payment_update_nanda_dental's variable_mapping values exactly (see the
  // migration that inserted it) -- resolved into Meta's positional parameters by
  // buildTemplateMessage, the same variable_mapping resolver send-recall-messages uses, not a
  // hand-written mapping specific to this function.
  const fields: Record<string, string> = {
    patient_name: trimmedPatientName,
    total_bill: formatAmountForWhatsapp(billing.total_billed),
    amount_paid: formatAmountForWhatsapp(billing.total_paid),
    // Mirrors the UI's own clamp (BillingBanner / send-recall-messages): never a negative number.
    balance_due: formatAmountForWhatsapp(Math.max(billing.due, 0)),
    clinic_name: trimmedClinicName,
  };
  const message = buildTemplateMessage(patient.mobile, template, fields);

  // Inserted before the API call, in 'queued' status, so a crash mid-call still leaves a trace --
  // client_request_id is stored from the start so a concurrent retry racing this same request
  // collides on idx_message_log_client_request_id instead of double-sending.
  const { data: logRow, error: logInsertError } = await serviceClient
    .from("message_log")
    .insert({
      clinic_id: clinic.id,
      recall_id: null,
      patient_id: patient.id,
      mobile: patient.mobile,
      template_name: template.meta_template_name,
      status: "queued",
      message_type: "payment",
      is_test: false,
      client_request_id: input.client_request_id,
    })
    .select("id")
    .single();

  if (logInsertError || !logRow) {
    // 23505 here means a concurrent request with the same client_request_id won the race and
    // already inserted its row -- treat exactly like the up-front idempotency check above.
    if (logInsertError?.code === "23505") {
      const { data: raceRow } = await serviceClient
        .from("message_log")
        .select("wa_message_id")
        .eq("clinic_id", patient.clinic_id)
        .eq("client_request_id", input.client_request_id)
        .maybeSingle();
      return json(
        { success: true, already_sent: true, wa_message_id: raceRow?.wa_message_id ?? null, patient_id: patient.id },
        200,
        cors,
      );
    }
    console.error(`Failed to insert message_log row for patient ${patient.id}`, logInsertError);
    return json({ error: "Failed to record the send attempt" }, 500, cors);
  }

  const result = await callGraphApi(clinic.waba_phone_number_id, accessToken, message);
  const nowIso = new Date().toISOString();

  if (result.ok) {
    await serviceClient
      .from("message_log")
      .update({ status: "sent", wa_message_id: result.waMessageId, sent_at: nowIso })
      .eq("id", logRow.id);

    await incrementMessagesSent(serviceClient, clinic.id, monthStart);

    return json({ success: true, wa_message_id: result.waMessageId, patient_id: patient.id }, 200, cors);
  }

  await serviceClient
    .from("message_log")
    .update({ status: "failed", error_code: result.errorCode, error_message: result.errorMessage })
    .eq("id", logRow.id);

  // Meta's exact error is returned unmodified, same convention as send-recall-now/send-test-message.
  return json(
    { success: false, error_code: result.errorCode, error_message: result.errorMessage, patient_id: patient.id },
    200,
    cors,
  );
});
