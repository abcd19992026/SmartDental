import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** Reads clinic_usage.messages_sent for one clinic/month -- the exact same read
 * send-recall-messages' processClinic and send-recall-now both already do inline before
 * comparing against clinic.monthly_message_quota. Extracted here so send-payment-message can
 * apply the identical monthly-quota check without a second, slightly-different query. Returns 0
 * (never null) for a clinic/month with no clinic_usage row yet, same as every existing call site. */
export async function getMonthlyMessagesSent(
  serviceClient: SupabaseClient,
  clinicId: string,
  monthStart: string,
): Promise<number> {
  const { data } = await serviceClient
    .from("clinic_usage")
    .select("messages_sent")
    .eq("clinic_id", clinicId)
    .eq("month", monthStart)
    .maybeSingle();
  return data?.messages_sent ?? 0;
}

/** Counts every message_log attempt (any status, any message_type -- sent and failed both count,
 * mirroring processClinic's "daily_message_cap counts every attempt" comment) for one clinic
 * since the start of the current IST calendar day. send-recall-messages' own daily_message_cap
 * check is an in-memory counter scoped to a single cron invocation's loop -- there is no
 * equivalent single loop for a one-shot, per-patient manual send, so this reads the same
 * underlying signal (attempts logged today) directly from message_log instead, which is the only
 * way a standalone request can apply the same "bounded attempts per day" rule the column name
 * promises. `todayStartIso` should be the IST calendar day's start as a real instant (see
 * combineIstInstant in ist-time.ts), not a naive date-string comparison. */
export async function countMessagesSentToday(
  serviceClient: SupabaseClient,
  clinicId: string,
  todayStartIso: string,
): Promise<number> {
  const { count } = await serviceClient
    .from("message_log")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .gte("created_at", todayStartIso);
  return count ?? 0;
}

/** Atomically upserts +1 onto clinic_usage.messages_sent via the increment_clinic_messages_sent
 * SQL function (see migrations) -- a read-then-write from here would race across concurrent
 * invocations. Shared by send-recall-messages and send-test-message: a test send is billed by
 * Meta the same as a real one, so it must count against the same quota counter. */
export async function incrementMessagesSent(
  serviceClient: SupabaseClient,
  clinicId: string,
  monthStart: string,
): Promise<void> {
  const { error } = await serviceClient.rpc("increment_clinic_messages_sent", {
    p_clinic_id: clinicId,
    p_month: monthStart,
  });
  if (error) {
    console.error(`Failed to increment clinic_usage for clinic ${clinicId}`, error);
  }
}
