import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
