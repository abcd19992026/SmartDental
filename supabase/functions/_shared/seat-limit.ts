import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface SeatLimitOk {
  ok: true;
}

export interface SeatLimitErr {
  ok: false;
  message: string;
}

/**
 * Checks a clinic's active-receptionist count against clinics.included_receptionists. Owner
 * accounts never count against this limit -- only role = 'receptionist' profiles with
 * is_active = true do.
 *
 * Pass `excludeUserId` when checking whether REACTIVATING a specific, currently-inactive
 * receptionist would push the clinic over the limit -- their own row is already excluded by the
 * is_active = true filter before the update runs, but passing it is a cheap defensive guard
 * against counting them twice if this is ever called after the flip instead of before it.
 *
 * Shared by create-staff-user (new receptionist) and admin-set-user-active (reactivating one) so
 * the limit is enforced identically, with the same message, in both places.
 */
export async function checkReceptionistSeatLimit(
  serviceClient: SupabaseClient,
  clinicId: string,
  excludeUserId?: string,
): Promise<SeatLimitOk | SeatLimitErr> {
  const { data: clinicRow, error: clinicError } = await serviceClient
    .from("clinics")
    .select("included_receptionists")
    .eq("id", clinicId)
    .single();
  if (clinicError || !clinicRow) {
    return { ok: false, message: "Could not resolve the clinic's receptionist seat limit" };
  }

  let query = serviceClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("role", "receptionist")
    .eq("is_active", true);
  if (excludeUserId) {
    query = query.neq("id", excludeUserId);
  }
  const { count, error: countError } = await query;
  if (countError) {
    return { ok: false, message: "Could not count the clinic's active receptionists" };
  }

  const used = count ?? 0;
  const limit = clinicRow.included_receptionists as number;
  if (used >= limit) {
    return {
      ok: false,
      message: `Receptionist seat limit reached (${used} of ${limit} used). Contact SmartDentist to add more seats.`,
    };
  }
  return { ok: true };
}
