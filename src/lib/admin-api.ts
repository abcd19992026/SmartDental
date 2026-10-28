import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Every function here returns a discriminated result instead of throwing -- callers branch on
// `.ok` rather than wrapping every call in try/catch. This is the ONLY place the UI should ever
// call these Edge Functions or RPCs from; never construct raw fetch calls or hand-roll
// Supabase queries for these operations elsewhere.
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Record<string, string> };

export async function toFunctionError(error: unknown): Promise<{ ok: false; error: string; fields?: Record<string, string> }> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      return { ok: false, error: body.error ?? "Request failed", fields: body.fields };
    } catch {
      return { ok: false, error: "Request failed" };
    }
  }
  return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
}

// ---------------------------------------------------------------------------
// create-clinic
// ---------------------------------------------------------------------------

export interface CreateClinicInput {
  clinic: {
    name: string;
    owner_name?: string;
    phone?: string;
    email?: string;
    city?: string;
    address?: string;
    logo_url?: string;
    waba_phone_number_id?: string;
    waba_business_id?: string;
    whatsapp_enabled?: boolean;
    send_time?: string;
    daily_message_cap?: number;
    monthly_message_quota?: number;
    plan_name?: string;
    plan_started_on: string;
    plan_expires_on: string;
  };
  branches: Array<{ name: string; address?: string; phone?: string }>;
  owner: { email: string; full_name: string; phone?: string };
}

export interface CreateClinicOutput {
  clinic_id: string;
  branch_ids: string[];
  owner: { id: string; email: string; temporary_password: string };
}

export async function createClinic(input: CreateClinicInput): Promise<ApiResult<CreateClinicOutput>> {
  const { data, error } = await supabase.functions.invoke<CreateClinicOutput>("create-clinic", {
    body: input,
  });
  if (error) return toFunctionError(error);
  if (!data) return { ok: false, error: "Empty response from server" };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// admin-reset-password
// ---------------------------------------------------------------------------

export interface ResetPasswordOutput {
  user_id: string;
  temporary_password: string;
}

export async function resetUserPassword(userId: string): Promise<ApiResult<ResetPasswordOutput>> {
  const { data, error } = await supabase.functions.invoke<ResetPasswordOutput>("admin-reset-password", {
    body: { user_id: userId },
  });
  if (error) return toFunctionError(error);
  if (!data) return { ok: false, error: "Empty response from server" };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// admin-set-user-active
// ---------------------------------------------------------------------------

export interface SetUserActiveOutput {
  user_id: string;
  is_active: boolean;
}

export async function setUserActive(userId: string, isActive: boolean): Promise<ApiResult<SetUserActiveOutput>> {
  const { data, error } = await supabase.functions.invoke<SetUserActiveOutput>("admin-set-user-active", {
    body: { user_id: userId, is_active: isActive },
  });
  if (error) return toFunctionError(error);
  if (!data) return { ok: false, error: "Empty response from server" };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// admin-set-clinic-whatsapp (super_admin only)
//
// Attach / detach a WhatsApp number that the platform owner added to the platform's WABA by hand
// in Meta WhatsApp Manager. The number is checked against Meta first; nothing is saved if Meta
// does not know it. One number can belong to only one clinic (error_code PHONE_NUMBER_IN_USE).
// ---------------------------------------------------------------------------

/** What Meta says about the number. Show display_phone_number + verified_name so the admin can
 * eyeball that it is the right number before relying on it. */
export interface WhatsappNumberInfo {
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  code_verification_status: string | null;
}

export interface VerifyWhatsappNumberOutput extends WhatsappNumberInfo {
  verified: true;
  saved: false;
}

export interface AttachClinicWhatsappInput {
  clinic_id: string;
  /** Digits only (the id Meta shows for the number, not the phone number itself). */
  waba_phone_number_id: string;
  /** Digits only. Optional. */
  waba_business_id?: string;
  /** Turns automatic sending on for the clinic. */
  enable: boolean;
}

export interface AttachClinicWhatsappOutput extends WhatsappNumberInfo {
  clinic_id: string;
  saved: true;
  waba_phone_number_id: string;
  waba_business_id: string | null;
  whatsapp_enabled: boolean;
  previous_waba_phone_number_id: string | null;
  /** false = the clinic still needs an approved default template before it can really send. */
  has_approved_default_template: boolean;
}

export interface DetachClinicWhatsappOutput {
  clinic_id: string;
  detached: true;
  /** false = it was already detached, nothing was written. */
  changed: boolean;
  previous_waba_phone_number_id?: string | null;
}

/** Only asks Meta; saves nothing. */
export async function verifyWhatsappNumber(wabaPhoneNumberId: string): Promise<ApiResult<VerifyWhatsappNumberOutput>> {
  const { data, error } = await supabase.functions.invoke<VerifyWhatsappNumberOutput>("admin-set-clinic-whatsapp", {
    body: { verify_only: true, waba_phone_number_id: wabaPhoneNumberId },
  });
  if (error) return toFunctionError(error);
  if (!data) return { ok: false, error: "Empty response from server" };
  return { ok: true, data };
}

export async function attachClinicWhatsapp(input: AttachClinicWhatsappInput): Promise<ApiResult<AttachClinicWhatsappOutput>> {
  const { data, error } = await supabase.functions.invoke<AttachClinicWhatsappOutput>("admin-set-clinic-whatsapp", {
    body: input,
  });
  if (error) return toFunctionError(error);
  if (!data) return { ok: false, error: "Empty response from server" };
  return { ok: true, data };
}

/** Clears the number and turns sending off, so a wrong number can be undone. */
export async function detachClinicWhatsapp(clinicId: string): Promise<ApiResult<DetachClinicWhatsappOutput>> {
  const { data, error } = await supabase.functions.invoke<DetachClinicWhatsappOutput>("admin-set-clinic-whatsapp", {
    body: { detach: true, clinic_id: clinicId },
  });
  if (error) return toFunctionError(error);
  if (!data) return { ok: false, error: "Empty response from server" };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// get_platform_overview (RPC, callable directly by an authenticated super_admin -- the
// function itself checks is_super_admin() and raises if the caller isn't one)
// ---------------------------------------------------------------------------

export interface PlatformOverview {
  total_clinics: number;
  active_clinics: number;
  suspended_clinics: number;
  expiring_within_30_days: number;
  messages_sent_this_month: number;
  payments_this_month: number;
}

export async function getPlatformOverview(): Promise<ApiResult<PlatformOverview>> {
  const { data, error } = await supabase.rpc("get_platform_overview");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as unknown as PlatformOverview };
}

// ---------------------------------------------------------------------------
// get_clinics_list (RPC, same is_super_admin() guard as above)
// ---------------------------------------------------------------------------

export interface ClinicListRow {
  id: string;
  name: string;
  city: string | null;
  owner_name: string | null;
  plan_expires_on: string | null;
  is_active: boolean;
  patients_count: number;
  messages_sent_this_month: number;
  whatsapp_configured: boolean;
}

export async function getClinicsList(): Promise<ApiResult<ClinicListRow[]>> {
  const { data, error } = await supabase.rpc("get_clinics_list");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as ClinicListRow[] };
}

// ---------------------------------------------------------------------------
// find_orphaned_clinics (RPC, same is_super_admin() guard as above) -- the on-demand detection
// net for a create-clinic onboarding whose compensation also failed after retries.
// ---------------------------------------------------------------------------

export type OrphanKind = "incomplete_onboarding" | "clinic_without_owner" | "auth_user_without_profile";

export interface OrphanRow {
  kind: OrphanKind;
  id: string;
  name: string | null;
  email: string | null;
  detail: string;
}

export async function findOrphanedClinics(): Promise<ApiResult<OrphanRow[]>> {
  const { data, error } = await supabase.rpc("find_orphaned_clinics");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as OrphanRow[] };
}
