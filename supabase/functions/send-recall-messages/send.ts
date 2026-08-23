import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { addDays, formatDateIST, istDateOf } from "../_shared/ist-time.ts";
import { buildTemplateMessage, callGraphApi, type WhatsappTemplate } from "../_shared/whatsapp-graph-api.ts";
import { incrementMessagesSent } from "../_shared/clinic-usage.ts";

/** Small gap between consecutive Graph API calls so a clinic with many due recalls doesn't fire
 * a burst that trips Meta's rate limiting -- a burst-induced 4xx would look identical to a real
 * send failure in message_log, which would be confusing to debug later. */
const SEND_DELAY_MS = 300;

interface Clinic {
  id: string;
  name: string;
  phone: string | null;
  waba_phone_number_id: string | null;
  daily_message_cap: number;
  monthly_message_quota: number;
}

export interface ClinicForSend {
  id: string;
  name: string;
  phone: string | null;
  /** Non-null here -- callers check this before ever reaching sendOneRecallMessage. */
  waba_phone_number_id: string;
}

export interface RecallRow {
  id: string;
  patient_id: string;
  due_date: string;
  attempt_count: number;
  last_attempt_at: string | null;
  patients: { name: string; mobile: string };
  visits: { visit_date: string; treatment_types: { name: string } | null } | null;
}

export interface ClinicRunResult {
  clinic_id: string;
  clinic_name: string;
  sent: number;
  failed: number;
  skipped_reason?: string;
}

export type SendOneRecallResult =
  | { ok: true; waMessageId: string }
  | { ok: false; errorCode: string | null; errorMessage: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sends one recall's WhatsApp template message and applies every downstream write exactly the
 * way this has always worked: a message_log row (queued -> sent/failed), the recall's
 * status/attempt_count/last_attempt_at/next_retry_date follow-up ladder, and clinic_usage on
 * success. Shared by the batch cron loop (processClinic below) and the manual send-recall-now
 * endpoint, so the two paths can never drift from each other -- whichever one calls this is the
 * only place a distinction between "cron" and "manual" exists at all. */
export async function sendOneRecallMessage(
  serviceClient: SupabaseClient,
  clinic: ClinicForSend,
  template: WhatsappTemplate,
  recall: RecallRow,
  dateStr: string,
  accessToken: string,
  monthStart: string,
): Promise<SendOneRecallResult> {
  // Dates are formatted for display ("13 Aug 2026"), never passed through as raw YYYY-MM-DD
  // column values -- a patient reading the message should never see a database date format.
  const fields: Record<string, string> = {
    patient_name: recall.patients.name,
    treatment_name: recall.visits?.treatment_types?.name ?? "",
    visit_date: recall.visits?.visit_date ? formatDateIST(recall.visits.visit_date) : "",
    due_date: formatDateIST(recall.due_date),
    clinic_phone: clinic.phone ?? "",
    clinic_name: clinic.name,
  };
  const message = buildTemplateMessage(recall.patients.mobile, template, fields);

  // Inserted before the API call, in 'queued' status, so a crash mid-call still leaves a trace.
  const { data: logRow, error: logInsertError } = await serviceClient
    .from("message_log")
    .insert({
      clinic_id: clinic.id,
      recall_id: recall.id,
      patient_id: recall.patient_id,
      mobile: recall.patients.mobile,
      template_name: template.meta_template_name,
      status: "queued",
    })
    .select("id")
    .single();

  if (logInsertError || !logRow) {
    console.error(`Failed to insert message_log row for recall ${recall.id}, skipping send`, logInsertError);
    return { ok: false, errorCode: null, errorMessage: "Failed to record the send attempt" };
  }

  const result = await callGraphApi(clinic.waba_phone_number_id, accessToken, message);
  const newAttemptCount = recall.attempt_count + 1;
  const nowIso = new Date().toISOString();

  if (result.ok) {
    await serviceClient
      .from("message_log")
      .update({ status: "sent", wa_message_id: result.waMessageId, sent_at: nowIso })
      .eq("id", logRow.id);

    // Follow-up ladder (day 0 / +3 / +10), driven entirely by next_retry_date rather than a
    // separate scheduler: after the 1st successful send, come back in 3 days; after the 2nd,
    // come back in 7 more days (3 + 7 = 10 from day 0, assuming each reminder fires on
    // schedule); after the 3rd, next_retry_date is cleared so the recall stops being selected
    // and sits in 'sent' for manual follow-up.
    const nextRetryDate =
      newAttemptCount === 1 ? addDays(dateStr, 3) : newAttemptCount === 2 ? addDays(dateStr, 7) : null;

    await serviceClient
      .from("recalls")
      .update({
        status: "sent",
        attempt_count: newAttemptCount,
        last_attempt_at: nowIso,
        next_retry_date: nextRetryDate,
      })
      .eq("id", recall.id);

    await incrementMessagesSent(serviceClient, clinic.id, monthStart);
    return { ok: true, waMessageId: result.waMessageId };
  }

  await serviceClient
    .from("message_log")
    .update({ status: "failed", error_code: result.errorCode, error_message: result.errorMessage })
    .eq("id", logRow.id);

  const updates: Record<string, unknown> = {
    attempt_count: newAttemptCount,
    last_attempt_at: nowIso,
  };
  if (newAttemptCount >= 3) {
    updates.status = "failed";
    updates.next_retry_date = null;
  } else {
    updates.status = "pending";
    updates.next_retry_date = addDays(dateStr, 1);
  }
  await serviceClient.from("recalls").update(updates).eq("id", recall.id);

  return { ok: false, errorCode: result.errorCode, errorMessage: result.errorMessage };
}

/** Processes every due recall for one clinic: loads the approved default template, enforces the
 * monthly quota and daily cap, sends each recall's message, and logs every outcome. Clinic-level
 * eligibility (whatsapp_enabled, is_active, plan_expires_on, send_time hour, send window) is
 * already filtered by the caller -- this only handles what happens once a clinic is selected. */
export async function processClinic(
  serviceClient: SupabaseClient,
  clinic: Clinic,
  dateStr: string,
  accessToken: string,
): Promise<ClinicRunResult> {
  const base: ClinicRunResult = { clinic_id: clinic.id, clinic_name: clinic.name, sent: 0, failed: 0 };

  if (!clinic.waba_phone_number_id) {
    console.log(`Skipping clinic ${clinic.id} (${clinic.name}): no waba_phone_number_id configured`);
    return { ...base, skipped_reason: "no_phone_number_id" };
  }
  const clinicForSend: ClinicForSend = { id: clinic.id, name: clinic.name, phone: clinic.phone, waba_phone_number_id: clinic.waba_phone_number_id };

  const { data: template, error: templateError } = await serviceClient
    .from("whatsapp_templates")
    .select("meta_template_name, language_code, variable_mapping")
    .eq("clinic_id", clinic.id)
    .eq("is_default", true)
    .eq("approval_status", "approved")
    .maybeSingle();

  if (templateError || !template) {
    console.log(`Skipping clinic ${clinic.id} (${clinic.name}): no approved default template`);
    return { ...base, skipped_reason: "no_default_template" };
  }

  const monthStart = `${dateStr.slice(0, 7)}-01`;
  const { data: usage } = await serviceClient
    .from("clinic_usage")
    .select("messages_sent")
    .eq("clinic_id", clinic.id)
    .eq("month", monthStart)
    .maybeSingle();

  let messagesSentThisMonth = usage?.messages_sent ?? 0;
  if (messagesSentThisMonth >= clinic.monthly_message_quota) {
    console.log(
      `Skipping clinic ${clinic.id} (${clinic.name}): monthly quota reached ` +
        `(${messagesSentThisMonth}/${clinic.monthly_message_quota})`,
    );
    return { ...base, skipped_reason: "monthly_quota_reached" };
  }

  // Two independent reasons a recall is due today:
  //  1. status = 'pending' and due_date has arrived (first attempt, or retry after a failure --
  //     the idempotency guard below is what actually prevents a same-day double-send, not this
  //     filter, since a failed attempt leaves due_date unchanged and in the past).
  //  2. status = 'sent' and next_retry_date has arrived (the day+3 / day+10 follow-up ladder for
  //     a recall that was already messaged once but hasn't been marked contacted/booked/etc).
  // visits!inner (not the default left-embed): a recall with a null visit_id must never be
  // selected here at all, regardless of how it went null. Deliberately defensive -- visit
  // deletion is the only known path today, but this holds even if a future path nulls it too.
  // Without this, sendOneRecallMessage would send Meta a template with empty {{2}}/{{3}} (Meta
  // rejects it with 131008), and the recall would sit retrying that same guaranteed failure for
  // up to 3 attempts before finally landing in status='failed'.
  const { data: recalls, error: recallsError } = await serviceClient
    .from("recalls")
    .select(
      `id, patient_id, due_date, attempt_count, last_attempt_at,
       patients!inner(name, mobile, is_active, do_not_disturb),
       visits!inner(visit_date, treatment_types(name))`,
    )
    .eq("clinic_id", clinic.id)
    .eq("patients.is_active", true)
    .eq("patients.do_not_disturb", false)
    .or(`and(status.eq.pending,due_date.lte.${dateStr}),and(status.eq.sent,next_retry_date.lte.${dateStr})`)
    .order("due_date", { ascending: true });

  if (recallsError) {
    console.error(`Failed to load due recalls for clinic ${clinic.id}`, recallsError);
    return { ...base, skipped_reason: "recall_query_failed" };
  }

  for (const recall of (recalls ?? []) as unknown as RecallRow[]) {
    // daily_message_cap counts every attempt (sent + failed), unlike monthly_message_quota
    // (which the spec ties explicitly to clinic_usage.messages_sent, a success-only counter).
    // The cap's purpose is bounding how many Graph API calls one clinic makes in a single run --
    // a burst of failures against a broken integration is exactly the runaway-cost/rate-limit
    // scenario it exists to stop, so failures must count against it too.
    if (base.sent + base.failed >= clinic.daily_message_cap) {
      console.log(`Clinic ${clinic.id} (${clinic.name}): reached daily_message_cap (${clinic.daily_message_cap})`);
      break;
    }
    if (messagesSentThisMonth >= clinic.monthly_message_quota) {
      console.log(`Clinic ${clinic.id} (${clinic.name}): monthly quota reached mid-run, stopping`);
      break;
    }

    // Idempotency guard: never send the same recall twice on the same IST calendar date, no
    // matter how many times the cron fires or this function is retried.
    const lastAttemptDateStr = recall.last_attempt_at ? istDateOf(new Date(recall.last_attempt_at)) : null;
    if (lastAttemptDateStr === dateStr) {
      continue;
    }

    const result = await sendOneRecallMessage(serviceClient, clinicForSend, template, recall, dateStr, accessToken, monthStart);
    if (result.ok) {
      messagesSentThisMonth++;
      base.sent++;
    } else {
      base.failed++;
    }

    await sleep(SEND_DELAY_MS);
  }

  return base;
}
