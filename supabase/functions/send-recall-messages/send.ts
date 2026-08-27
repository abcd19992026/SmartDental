import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { addDays, formatDateIST, formatTimeIST12h } from "../_shared/ist-time.ts";
import { buildTemplateMessage, callGraphApi, type WhatsappTemplate } from "../_shared/whatsapp-graph-api.ts";
import { incrementMessagesSent } from "../_shared/clinic-usage.ts";
import { determineStageToSend, type LadderStage } from "./ladder.ts";

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
  due_time: string | null;
  status: string;
  attempt_count: number;
  /** 21A-1's ladder progress marker: null (nothing sent yet against the current due_date/
   * due_time), or 1/2/3 (the highest stage actually sent). The DB-level reset trigger nulls this
   * whenever due_date/due_time changes, so a reschedule always re-enters the ladder from stage 1. */
  last_stage_sent: number | null;
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
  // Required text field (patient/treatment/visit/due-date/clinic name) missing, OR the atomic
  // claim below found this stage no longer eligible (status changed, or another invocation
  // already claimed it) -- no message_log row was ever inserted, no Graph API call was made.
  // Distinct from the ok:false-with-errorCode case so callers don't count this as a real send
  // failure.
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; errorCode: string | null; errorMessage: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mirrors formatINR's number formatting (src/lib/utils.ts) exactly -- round to the nearest
 * integer, en-IN digit grouping -- minus the currency symbol, since the WhatsApp template body
 * already has a literal ₹ in front of {{4}}/{{5}}/{{6}}. Never returns an empty string: Math.round
 * of any finite number, including 0, always produces a non-empty "0"+ string. */
function formatAmountForWhatsapp(value: number): string {
  return Math.round(value).toLocaleString("en-IN");
}

interface PatientBilling {
  total_billed: number;
  total_paid: number;
  due: number;
}

/** Same view the patient detail page's BillingBanner reads (Phase 6A) -- total_billed = SUM of
 * this patient's visits.net_amount, total_paid = SUM of non-voided patient_payments.amount, due =
 * total_billed - total_paid. Querying it here rather than reimplementing the SUMs keeps this
 * function unable to drift from what the clinic sees on screen for the same patient. Returns
 * zeroes (never null/undefined) for a patient with no visits/payments at all -- the view is
 * driven from patients, so a row always exists, but this function only ever needs patient_id and
 * has no independent reason to assume one back regardless. */
async function fetchPatientBilling(serviceClient: SupabaseClient, patientId: string): Promise<PatientBilling> {
  const { data } = await serviceClient
    .from("patient_billing_summary")
    .select("total_billed, total_paid, due")
    .eq("patient_id", patientId)
    .maybeSingle();

  return {
    total_billed: Number(data?.total_billed ?? 0),
    total_paid: Number(data?.total_paid ?? 0),
    due: Number(data?.due ?? 0),
  };
}

/** {{4}}'s text, in the exact shape 21A-2 specifies per stage -- the only part of the template's
 * fixed five parameters that varies by stage, so a stage-1 "tomorrow" reminder and a same-day
 * stage-2 reminder never read identically to the patient even though both can arrive close
 * together. due_time is guaranteed non-null for stage 2 -- determineStageToSend() never returns 2
 * otherwise. */
function buildDueDateText(stage: LadderStage, dueDateRaw: string, dueTimeRaw: string | null): string {
  const dateText = formatDateIST(dueDateRaw);
  if (stage === 1) {
    return dueTimeRaw ? `${dateText} (tomorrow, ${formatTimeIST12h(dueTimeRaw)})` : `${dateText} (tomorrow)`;
  }
  if (stage === 2) {
    return `today, ${formatTimeIST12h(dueTimeRaw!)}`;
  }
  return dateText; // stage 3
}

/** The five text fields every template variant so far has needed (recall_reminder uses all five;
 * test_recall uses them alongside the three payment fields below). Returns null if any is
 * missing/empty so the caller can skip this recall entirely rather than send Meta a template with
 * an empty parameter (error 131008). visits!inner in the cron query already excludes recalls with
 * no visit at all, but send-recall-now's single-recall lookup does NOT use visits!inner (an owner
 * can trigger it for any recall id in their clinic) -- this check is what actually protects that
 * path, since both callers go through this same function. */
function buildRequiredTextFields(recall: RecallRow, clinicName: string, stage: LadderStage): Record<string, string> | null {
  const patientName = recall.patients.name?.trim();
  const treatmentName = recall.visits?.treatment_types?.name?.trim();
  const visitDateRaw = recall.visits?.visit_date;
  const dueDateRaw = recall.due_date;
  const trimmedClinicName = clinicName?.trim();

  if (!patientName || !treatmentName || !visitDateRaw || !dueDateRaw || !trimmedClinicName) {
    return null;
  }

  return {
    patient_name: patientName,
    treatment_name: treatmentName,
    // Dates are formatted for display ("13 Aug 2026"), never passed through as raw YYYY-MM-DD
    // column values -- a patient reading the message should never see a database date format.
    visit_date: formatDateIST(visitDateRaw),
    due_date: buildDueDateText(stage, dueDateRaw, recall.due_time),
    clinic_name: trimmedClinicName,
  };
}

/** Sends one recall's WhatsApp template message for a specific ladder stage, and applies every
 * downstream write exactly the way this has always worked: a message_log row (queued ->
 * sent/failed), the recall's status/attempt_count/last_attempt_at, and clinic_usage on success.
 * Shared by the batch cron loop (processClinic below) and the manual send-recall-now endpoint
 * (which passes stage: null -- see below), so the two paths can never drift from each other on
 * everything except the one thing that's genuinely different between them: the cron path's
 * ladder-stage claim. */
export async function sendOneRecallMessage(
  serviceClient: SupabaseClient,
  clinic: ClinicForSend,
  template: WhatsappTemplate,
  recall: RecallRow,
  /** The ladder stage this send represents, or `null` for an unconditional manual send
   * (send-recall-now's "Send Now" button). A manual send deliberately bypasses the ladder
   * entirely -- same as before this rewrite -- so it never claims/advances last_stage_sent and
   * is never blocked by it (an owner must always be able to message a patient on demand,
   * regardless of where the automatic ladder currently stands). {{4}}'s text uses stage 3's
   * plain-date shape in that case, since a manual click has no "tomorrow"/"today" relationship
   * to due_date to assert -- it could happen on any day. */
  stage: LadderStage | null,
  accessToken: string,
  monthStart: string,
): Promise<SendOneRecallResult> {
  const textFields = buildRequiredTextFields(recall, clinic.name, stage ?? 3);
  if (!textFields) {
    const reason =
      `Recall ${recall.id}: missing required field(s) for a WhatsApp send ` +
      `(patient_name/treatment_name/visit_date/due_date/clinic_name) -- skipping${stage !== null ? ` stage ${stage}` : ""}, ` +
      `not sending a template with an empty parameter.`;
    console.warn(reason);
    return { ok: false, skipped: true, reason };
  }

  // Atomic claim: re-checks status AND ladder progress at the database level, immediately before
  // sending -- not just against the (possibly several-minutes-stale) snapshot the batch query
  // fetched. Whichever concurrent invocation's UPDATE actually matches wins the right to send
  // this stage; the other sees 0 rows and aborts without ever calling the Graph API or writing
  // message_log. This is what makes two overlapping cron runs safe (task 11g), and it's what
  // "status re-checked immediately before sending" (task 6) actually means at the DB level.
  // Skipped entirely for a manual send (stage === null) -- see the stage param's doc above.
  if (stage !== null) {
    const { data: claimed, error: claimError } = await serviceClient
      .from("recalls")
      .update({ last_stage_sent: stage })
      .eq("id", recall.id)
      .in("status", ["pending", "sent"])
      .or(`last_stage_sent.is.null,last_stage_sent.lt.${stage}`)
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error(`Failed to claim recall ${recall.id} for stage ${stage}`, claimError);
      return { ok: false, skipped: true, reason: `Claim failed: ${claimError.message}` };
    }
    if (!claimed) {
      // Status moved off pending/sent (contacted/booked/declined/completed/paused), or another
      // invocation already claimed this stage since the batch query ran. Not an error --
      // correctly nothing left to do.
      return {
        ok: false,
        skipped: true,
        reason: `Recall ${recall.id}: no longer eligible for stage ${stage} at send time`,
      };
    }
  }

  // Patient-level, matching the patient detail page's billing header exactly (all visits, all
  // non-voided payments for this patient) -- never per-visit.
  const billing = await fetchPatientBilling(serviceClient, recall.patient_id);

  const fields: Record<string, string> = {
    ...textFields,
    clinic_phone: clinic.phone ?? "",
    total_billed: formatAmountForWhatsapp(billing.total_billed),
    total_paid: formatAmountForWhatsapp(billing.total_paid),
    // Mirrors the UI's own clamp: BillingBanner shows a literal "₹0" (not a negative number)
    // whenever due <= 0, rather than the raw signed total_billed - total_paid.
    amount_due: formatAmountForWhatsapp(Math.max(billing.due, 0)),
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
    // Nothing was actually sent -- release the claim so this stage remains retryable on a later
    // tick within its own window, per task 9. No claim exists at all for a manual send.
    if (stage !== null) {
      await serviceClient
        .from("recalls")
        .update({ last_stage_sent: stage === 1 ? null : ((stage - 1) as LadderStage) })
        .eq("id", recall.id)
        .eq("last_stage_sent", stage);
    }
    return { ok: false, skipped: false, errorCode: null, errorMessage: "Failed to record the send attempt" };
  }

  const result = await callGraphApi(clinic.waba_phone_number_id, accessToken, message);
  const newAttemptCount = recall.attempt_count + 1;
  const nowIso = new Date().toISOString();

  if (result.ok) {
    await serviceClient
      .from("message_log")
      .update({ status: "sent", wa_message_id: result.waMessageId, sent_at: nowIso })
      .eq("id", logRow.id);

    // last_stage_sent is already set by the claim above -- attempt_count/last_attempt_at stay
    // purely historical/observability fields, same as before this rewrite (attempt_count is read
    // by TodayPage's monthly stats; the ladder itself never reads either of them anymore).
    await serviceClient
      .from("recalls")
      .update({ status: "sent", attempt_count: newAttemptCount, last_attempt_at: nowIso })
      .eq("id", recall.id);

    await incrementMessagesSent(serviceClient, clinic.id, monthStart);
    return { ok: true, waMessageId: result.waMessageId };
  }

  await serviceClient
    .from("message_log")
    .update({ status: "failed", error_code: result.errorCode, error_message: result.errorMessage })
    .eq("id", logRow.id);

  // A failed send must NOT mark its stage as sent -- release the claim (guarded so we only revert
  // what we ourselves set) so a later cron tick can retry it, as long as we're still inside this
  // stage's own day/window per determineStageToSend. No claim exists at all for a manual send.
  // status goes back to 'pending' rather than a terminal 'failed': under the new ladder, each
  // stage's own calendar-day boundary is what ends retries, not a 3-strikes counter (there is no
  // longer a +3/+10 tier to fall back to).
  const revertUpdate: Record<string, unknown> = {
    status: "pending",
    attempt_count: newAttemptCount,
    last_attempt_at: nowIso,
  };
  let revertQuery = serviceClient.from("recalls").update(revertUpdate).eq("id", recall.id);
  if (stage !== null) {
    revertUpdate.last_stage_sent = stage === 1 ? null : ((stage - 1) as LadderStage);
    revertQuery = revertQuery.eq("last_stage_sent", stage);
  }
  await revertQuery;

  return { ok: false, skipped: false, errorCode: result.errorCode, errorMessage: result.errorMessage };
}

/** Processes every candidate recall for one clinic: loads the approved default template,
 * enforces the monthly quota and daily cap, decides each recall's due ladder stage (if any), and
 * sends/logs the outcome. Clinic-level eligibility (whatsapp_enabled, is_active, plan_expires_on)
 * is already filtered by the caller -- this only handles what happens once a clinic is selected.
 * istHour/clinicSendHour are passed in rather than recomputed here so a single getIstNow() call
 * per invocation stays the one source of truth for "now" across every clinic processed. */
export async function processClinic(
  serviceClient: SupabaseClient,
  clinic: Clinic,
  dateStr: string,
  istHour: number,
  clinicSendHour: number,
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

  // Selection window: due_date within one day either side of today (IST). Stage 1 fires the day
  // BEFORE due_date, stage 3 the day AFTER -- a plain "due_date <= today" filter (the old query)
  // would miss stage 1 entirely. status stays in ('pending','sent') exactly as before; which of
  // the (up to 3) stages is actually due for each row is decided per-recall below, not by this
  // query -- next_retry_date is no longer read or written anywhere in this function.
  // visits!inner (not the default left-embed): a recall with a null visit_id must never be
  // selected here at all, regardless of how it went null. Deliberately defensive -- visit
  // deletion is the only known path today, but this holds even if a future path nulls it too.
  // Without this, sendOneRecallMessage would send Meta a template with empty {{2}}/{{3}} (Meta
  // rejects it with 131008), and the recall would sit retrying that same guaranteed failure.
  const windowStart = addDays(dateStr, -1);
  const windowEnd = addDays(dateStr, 1);

  const { data: recalls, error: recallsError } = await serviceClient
    .from("recalls")
    .select(
      `id, patient_id, due_date, due_time, status, attempt_count, last_stage_sent,
       patients!inner(name, mobile, is_active, do_not_disturb),
       visits!inner(visit_date, treatment_types(name))`,
    )
    .eq("clinic_id", clinic.id)
    .eq("patients.is_active", true)
    .eq("patients.do_not_disturb", false)
    .in("status", ["pending", "sent"])
    .gte("due_date", windowStart)
    .lte("due_date", windowEnd)
    .or("last_stage_sent.is.null,last_stage_sent.lt.3")
    .order("due_date", { ascending: true });

  if (recallsError) {
    console.error(`Failed to load candidate recalls for clinic ${clinic.id}`, recallsError);
    return { ...base, skipped_reason: "recall_query_failed" };
  }

  const nowInstant = new Date();

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

    const stage = determineStageToSend({
      dueDate: recall.due_date,
      dueTime: recall.due_time,
      lastStageSent: recall.last_stage_sent,
      todayStr: dateStr,
      istHour,
      nowInstant,
      clinicSendHour,
    });

    if (stage === null) {
      continue;
    }

    const result = await sendOneRecallMessage(serviceClient, clinicForSend, template, recall, stage, accessToken, monthStart);
    if (result.ok) {
      messagesSentThisMonth++;
      base.sent++;
    } else if (result.skipped) {
      // No message_log row, no Graph API call, no daily-cap/quota consumption -- the warning was
      // already logged inside sendOneRecallMessage. Doesn't count toward daily_message_cap since
      // nothing was actually attempted against Meta.
      continue;
    } else {
      base.failed++;
    }

    await sleep(SEND_DELAY_MS);
  }

  return base;
}
