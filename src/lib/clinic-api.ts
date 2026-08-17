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
// send-test-message (Edge Function) -- an owner or super_admin sends one live WhatsApp message
// using the clinic's approved default template and placeholder sample values, to confirm the
// WABA connection actually works before enabling automated sending. See
// supabase/functions/send-test-message/index.ts: clinic_id is ignored for an owner caller (their
// own clinic is always used), rate-limited to 5/hour per clinic, and counts against the clinic's
// real monthly_message_quota exactly like a recall send.
//
// The function returns HTTP 200 for both a real send success AND a Meta-rejected send (the
// request itself completed either way) -- only auth/validation/rate-limit/infra problems come
// back as a non-200 `error` through toFunctionError. Callers must check `data.success`, not just
// `.ok`, to know whether the message actually went out.
// ---------------------------------------------------------------------------

export interface SendTestMessageOutput {
  success: boolean;
  wa_message_id?: string;
  mobile?: string;
  template_name?: string;
  error_code?: string | null;
  error_message?: string;
}

export async function sendTestMessage(mobile: string): Promise<ApiResult<SendTestMessageOutput>> {
  const { data, error } = await supabase.functions.invoke<SendTestMessageOutput>("send-test-message", {
    body: { mobile },
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

// ---------------------------------------------------------------------------
// uploadOwnAvatar / removeOwnAvatar -- the full storage lifecycle on top of updateOwnAvatar's
// plain DB write. Without explicit cleanup, every upload leaves the previous file(s) behind
// forever (the path includes a timestamp, so each one is unique) -- this is what actually
// deletes the old object(s), not just the DB reference to them.
//
// A user deleting/replacing objects in their own {auth.uid()}/ folder is already permitted by
// the existing user-avatars storage RLS (user_avatars_own_update / _own_delete, from the avatar
// feature migration) -- confirmed live below, not assumed; no policy changes were needed here.
// ---------------------------------------------------------------------------

async function listOwnAvatarPaths(userId: string): Promise<ApiResult<string[]>> {
  const { data, error } = await supabase.storage.from("user-avatars").list(userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map((f) => `${userId}/${f.name}`) };
}

export interface UploadOwnAvatarOutput {
  avatar_url: string;
}

export async function uploadOwnAvatar(file: Blob, fileExt: string): Promise<ApiResult<UploadOwnAvatarOutput>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Not signed in" };
  }
  const userId = userData.user.id;

  // Upload the new file, then point avatar_url at it, BEFORE touching the old file(s). If
  // cleanup below fails, the user still ends up with a working avatar -- a stray old file is a
  // harmless leftover, never a broken photo.
  const newPath = `${userId}/${Date.now()}.${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from("user-avatars")
    .upload(newPath, file, { contentType: file.type || undefined });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: urlData } = supabase.storage.from("user-avatars").getPublicUrl(newPath);
  const updateResult = await updateOwnAvatar(urlData.publicUrl);
  if (!updateResult.ok) return updateResult;

  const listResult = await listOwnAvatarPaths(userId);
  if (!listResult.ok) {
    console.warn("uploadOwnAvatar: failed to list existing avatar files for cleanup", listResult.error);
  } else {
    const stalePaths = listResult.data.filter((path) => path !== newPath);
    if (stalePaths.length > 0) {
      const { error: removeError } = await supabase.storage.from("user-avatars").remove(stalePaths);
      if (removeError) {
        console.warn("uploadOwnAvatar: failed to clean up old avatar file(s)", removeError.message);
      }
    }
  }

  return { ok: true, data: { avatar_url: urlData.publicUrl } };
}

export async function removeOwnAvatar(): Promise<ApiResult<{ avatar_url: null }>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Not signed in" };
  }
  const userId = userData.user.id;

  const listResult = await listOwnAvatarPaths(userId);
  if (!listResult.ok) return { ok: false, error: listResult.error };

  if (listResult.data.length > 0) {
    const { error: removeError } = await supabase.storage.from("user-avatars").remove(listResult.data);
    if (removeError) {
      // Storage delete failed -- do NOT null out avatar_url, or the DB and the actual file state
      // would disagree (DB says "no avatar" while the file is still sitting in storage).
      return { ok: false, error: removeError.message };
    }
  }

  return (await updateOwnAvatar(null)) as unknown as ApiResult<{ avatar_url: null }>;
}

// ---------------------------------------------------------------------------
// uploadClinicLogo / removeClinicLogo -- same storage-cleanup pattern as
// uploadOwnAvatar/removeOwnAvatar, keyed by clinic_id instead of the caller's own user id (bucket:
// clinic-logos, RLS: owner-only, scoped to their own clinic's folder -- see the
// clinic_logos_owner_* policies). This mirrors a leak that existed in the clinic logo flow: every
// upload left the previous file behind in storage, and "Remove Logo" only cleared
// clinics.logo_url without ever touching the file itself.
// ---------------------------------------------------------------------------

async function listClinicLogoPaths(clinicId: string): Promise<ApiResult<string[]>> {
  const { data, error } = await supabase.storage.from("clinic-logos").list(clinicId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map((f) => `${clinicId}/${f.name}`) };
}

export interface UploadClinicLogoOutput {
  logo_url: string;
}

export async function uploadClinicLogo(
  clinicId: string,
  file: Blob,
  fileExt: string,
): Promise<ApiResult<UploadClinicLogoOutput>> {
  // Upload the new file, then point logo_url at it, BEFORE touching the old file(s) -- same
  // ordering as uploadOwnAvatar, so a cleanup failure leaves a harmless orphaned file rather than
  // a broken logo.
  const newPath = `${clinicId}/${Date.now()}.${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from("clinic-logos")
    .upload(newPath, file, { contentType: file.type || undefined });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: urlData } = supabase.storage.from("clinic-logos").getPublicUrl(newPath);
  const { error: updateError } = await supabase
    .from("clinics")
    .update({ logo_url: urlData.publicUrl })
    .eq("id", clinicId);
  if (updateError) return { ok: false, error: updateError.message };

  const listResult = await listClinicLogoPaths(clinicId);
  if (!listResult.ok) {
    console.warn("uploadClinicLogo: failed to list existing logo files for cleanup", listResult.error);
  } else {
    const stalePaths = listResult.data.filter((path) => path !== newPath);
    if (stalePaths.length > 0) {
      const { error: removeError } = await supabase.storage.from("clinic-logos").remove(stalePaths);
      if (removeError) {
        console.warn("uploadClinicLogo: failed to clean up old logo file(s)", removeError.message);
      }
    }
  }

  return { ok: true, data: { logo_url: urlData.publicUrl } };
}

export async function removeClinicLogo(clinicId: string): Promise<ApiResult<{ logo_url: null }>> {
  const listResult = await listClinicLogoPaths(clinicId);
  if (!listResult.ok) return { ok: false, error: listResult.error };

  if (listResult.data.length > 0) {
    const { error: removeError } = await supabase.storage.from("clinic-logos").remove(listResult.data);
    if (removeError) {
      // Storage delete failed -- do NOT null out logo_url, same reasoning as removeOwnAvatar: the
      // DB and the actual file state must not disagree.
      return { ok: false, error: removeError.message };
    }
  }

  const { error: updateError } = await supabase.from("clinics").update({ logo_url: null }).eq("id", clinicId);
  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true, data: { logo_url: null } };
}
