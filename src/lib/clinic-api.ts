import type { ApiResult } from "@/lib/admin-api";
import { toFunctionError } from "@/lib/admin-api";
import { supabase } from "@/lib/supabase";

// Clinic-side (owner/receptionist) operations, kept separate from admin-api.ts's super-admin
// surface -- these run under the caller's own RLS-scoped session, never a service-role client.
// Same discriminated-result shape as admin-api.ts so callers branch on `.ok` the same way.

// admin-reset-password and admin-set-user-active now authorize an owner as well as a
// super_admin (see supabase/functions/_shared/auth.ts's authorizeOwnerOrSuperAdmin) -- re-export
// the existing wrappers rather than duplicating them, so both the admin and clinic UI surfaces
// call the same one implementation.
export { resetUserPassword, setUserActive } from "@/lib/admin-api";
export type { ResetPasswordOutput, SetUserActiveOutput } from "@/lib/admin-api";

// ---------------------------------------------------------------------------
// create_visit_with_recall
// ---------------------------------------------------------------------------

export interface CreateVisitWithRecallInput {
  patient_id: string;
  treatment_type_id: string;
  visit_date: string;
  tooth_numbers?: string | null;
  notes?: string | null;
  amount?: number | null;
  recall_date_override?: string | null;
}

export interface CreateVisitWithRecallOutput {
  visit_id: string;
  recall_id: string;
  due_date: string;
}

export async function createVisitWithRecall(
  input: CreateVisitWithRecallInput,
): Promise<ApiResult<CreateVisitWithRecallOutput>> {
  const { data, error } = await (supabase.rpc as any)("create_visit_with_recall", {
    p_patient_id: input.patient_id,
    p_treatment_type_id: input.treatment_type_id,
    p_visit_date: input.visit_date,
    p_tooth_numbers: input.tooth_numbers ?? null,
    p_notes: input.notes ?? null,
    p_amount: input.amount ?? null,
    p_recall_date_override: input.recall_date_override ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as unknown as CreateVisitWithRecallOutput };
}

// ---------------------------------------------------------------------------
// create-staff-user (Edge Function) -- an owner provisions a receptionist or co-owner in their
// own clinic; a super_admin may provision into any clinic by supplying clinic_id. See
// supabase/functions/create-staff-user/index.ts for the authorization/containment rules this
// wrapper relies on server-side -- clinic_id here is ignored for an owner caller, never trusted
// as a way to place a user in someone else's clinic.
// ---------------------------------------------------------------------------

export interface CreateStaffUserInput {
  email: string;
  full_name: string;
  phone?: string;
  role: "owner" | "receptionist";
  /** Required when role is "receptionist"; ignored for "owner". */
  branch_id?: string;
  /** Only honored when the caller is a super_admin; an owner's own clinic is always used instead. */
  clinic_id?: string;
}

export interface CreateStaffUserOutput {
  user_id: string;
  email: string;
  role: "owner" | "receptionist";
  branch_id: string | null;
  temporary_password: string;
}

export async function createStaffUser(input: CreateStaffUserInput): Promise<ApiResult<CreateStaffUserOutput>> {
  const { data, error } = await supabase.functions.invoke<CreateStaffUserOutput>("create-staff-user", {
    body: input,
  });
  if (error) return toFunctionError(error);
  if (!data) return { ok: false, error: "Empty response from server" };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// updateOwnAvatar -- a plain Supabase update, not an Edge Function: this is a same-tenant,
// same-user write (auth.uid() = the row being updated) that RLS already permits on its own via
// profiles_self_update_avatar, with protect_profile_role_fields() restricting it to avatar_url
// only. No service-role/server-side logic is needed, so it lives here as a typed wrapper rather
// than a raw call scattered in a component, same discipline as every other function in this file.
// ---------------------------------------------------------------------------

export interface UpdateOwnAvatarOutput {
  avatar_url: string | null;
}

export async function updateOwnAvatar(avatarUrl: string | null): Promise<ApiResult<UpdateOwnAvatarOutput>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Not signed in" };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userData.user.id)
    .select("avatar_url")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { avatar_url: data.avatar_url } };
}
