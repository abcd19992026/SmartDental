import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Every function here returns a discriminated result instead of throwing -- callers branch on
// `.ok` rather than wrapping every call in try/catch. This is the ONLY place the UI should ever
// call these Edge Functions or RPCs from; never construct raw fetch calls or hand-roll
// Supabase queries for these operations elsewhere.
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Record<string, string> };

async function toFunctionError(error: unknown): Promise<{ ok: false; error: string; fields?: Record<string, string> }> {
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
