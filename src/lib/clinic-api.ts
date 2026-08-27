import type { ApiResult } from "@/lib/admin-api";
import { toFunctionError } from "@/lib/admin-api";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";
import { todayIST } from "@/lib/dates";

// Clinic-side (owner/receptionist) operations, kept separate from admin-api.ts's super-admin
// surface -- these run under the caller's own RLS-scoped session, never a service-role client.
// Same discriminated-result shape as admin-api.ts so callers branch on `.ok` the same way.

// admin-reset-password and admin-set-user-active now authorize an owner as well as a
// super_admin (see supabase/functions/_shared/auth.ts's authorizeOwnerOrSuperAdmin) -- re-export
// the existing wrappers rather than duplicating them, so both the admin and clinic UI surfaces
// call the same one implementation.
export { resetUserPassword, setUserActive } from "@/lib/admin-api";
export type { ResetPasswordOutput, SetUserActiveOutput } from "@/lib/admin-api";

/** True when an ApiResult's error is the client_request_id collision message
 * (createVisitWithRecall / insertPayment / createPrescription all produce it verbatim on a
 * 23505 against their partial unique index). A caller hitting this on a retry should treat it as
 * success -- the row from the first attempt already exists -- not show it as a failure. */
export function isAlreadySavedError(error: string): boolean {
  return error.includes("already saved");
}

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
  /** 0-100. Defaults to 0 (no discount) at the database level if omitted -- visits.net_amount is
   * a generated column derived from amount and this field, so it's always internally consistent. */
  discount_percent?: number | null;
  /** FDI tooth numbers (permanent 11-48, deciduous 51-85) -- validated against the full valid set
   * by visits_teeth_valid_fdi at the database level, and sorted/deduplicated inside the RPC
   * regardless of click order. tooth_numbers (free text) is still written alongside this during
   * the transition; teeth is the structured column new code should read. */
  teeth?: number[] | null;
  /** One value per form opening, sent unchanged on every submit attempt (including retries after
   * a slow/failed network response) -- a duplicate collides with visits' partial unique index on
   * this column instead of creating a second visit. Omit only for callers that accept the
   * (rare, pre-S1) risk of a double-submit duplicating a visit. */
  client_request_id?: string | null;
  /** Time of day the patient is expected at for the recall, e.g. "14:30". Optional -- omit or
   * pass null for "no specific time known" (the recall reminder ladder, built in 21A-2, treats
   * that as skipping its time-of-day-dependent stage). */
  recall_due_time?: string | null;
}

export interface CreateVisitWithRecallOutput {
  visit_id: string;
  recall_id: string;
  due_date: string;
  due_time: string | null;
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
    p_discount_percent: input.discount_percent ?? 0,
    p_teeth: input.teeth ?? null,
    p_client_request_id: input.client_request_id ?? null,
    p_recall_due_time: input.recall_due_time ?? null,
  });
  if (error && (error as { code?: string }).code === "23505") {
    return { ok: false, error: "This visit was already saved -- refresh to see it." };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as unknown as CreateVisitWithRecallOutput };
}

// ---------------------------------------------------------------------------
// recall schedule updates (reschedule / snooze paths)
// ---------------------------------------------------------------------------

export interface UpdateRecallScheduleInput {
  due_date: string;
  /** Time the patient is expected at, e.g. "14:30". Omit to leave the existing value unchanged;
   * pass null to clear an existing time. */
  due_time?: string | null;
}

export interface UpdateRecallScheduleOutput {
  id: string;
  due_date: string;
  due_time: string | null;
}

/** Reschedules a recall's due_date/due_time under the caller's own RLS (recalls_update already
 * scopes this to the caller's own clinic/branch, same as every other direct recall update in
 * this codebase) -- a due_date/due_time change here resets the recall's ladder progress via the
 * DB-level trg_reset_recall_ladder_stage trigger, so a rescheduled recall gets its reminders
 * again regardless of which call site performs the update. */
export async function updateRecallSchedule(
  recallId: string,
  input: UpdateRecallScheduleInput,
): Promise<ApiResult<UpdateRecallScheduleOutput>> {
  const payload: Database["public"]["Tables"]["recalls"]["Update"] = { due_date: input.due_date };
  if (input.due_time !== undefined) {
    payload.due_time = input.due_time;
  }
  const { data, error } = await supabase
    .from("recalls")
    .update(payload)
    .eq("id", recallId)
    .select("id, due_date, due_time")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
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
// send-recall-now (Edge Function) -- an owner or super_admin sends one specific recall's
// WhatsApp message immediately, bypassing the due_date check the daily cron applies, for live
// demos without waiting for the scheduled run. See supabase/functions/send-recall-now/index.ts:
// containment (an owner can only target a recall in their own clinic), the clinic's
// whatsapp_enabled/is_active/plan/quota gates, and the patient's is_active/do_not_disturb flags
// are all still enforced -- this is a timing bypass only, not a safety bypass.
//
// Same HTTP-200-for-both-outcomes convention as send-test-message: check `data.success`, not
// just `.ok`, to know whether the message actually went out.
// ---------------------------------------------------------------------------

export interface SendRecallNowOutput {
  success: boolean;
  wa_message_id?: string;
  error_code?: string | null;
  error_message?: string;
  recall_id: string;
}

export async function sendRecallNow(recallId: string): Promise<ApiResult<SendRecallNowOutput>> {
  const { data, error } = await supabase.functions.invoke<SendRecallNowOutput>("send-recall-now", {
    body: { recall_id: recallId },
  });
  if (error) return toFunctionError(error);
  if (!data) return { ok: false, error: "Empty response from server" };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// patient_payments / patient_billing_summary -- Phase 6A. Plain RLS-scoped reads/writes, no Edge
// Function: patient_payments is append-only (no DELETE policy exists at all; UPDATE is
// owner/super_admin-only and an allowlist trigger permits changing only voided_at/voided_by/
// void_reason), so "editing" a payment is never a real operation -- voidPayment below is the only
// write path once a payment exists. clinic_id/branch_id sent from here are never trusted as-is:
// the INSERT policy's WITH CHECK independently re-validates both against current_clinic_id() /
// current_branch_id(), so a value that doesn't match the caller's own clinic/branch is rejected by
// the database regardless of what this function is called with.
// ---------------------------------------------------------------------------

export interface PatientBillingSummary {
  patient_id: string;
  clinic_id: string;
  total_billed: number;
  total_paid: number;
  due: number;
}

export async function fetchBillingSummary(patientId: string): Promise<ApiResult<PatientBillingSummary>> {
  const { data, error } = await supabase
    .from("patient_billing_summary")
    .select("patient_id, clinic_id, total_billed, total_paid, due")
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  // Not found = either the patient doesn't exist, or RLS (via the view's security_invoker) hid
  // it -- both cases are indistinguishable from here by design, same as any other cross-tenant
  // lookup in this codebase.
  if (!data) return { ok: false, error: "Patient not found or not accessible" };
  return {
    ok: true,
    data: {
      patient_id: data.patient_id as string,
      clinic_id: data.clinic_id as string,
      total_billed: Number(data.total_billed ?? 0),
      total_paid: Number(data.total_paid ?? 0),
      due: Number(data.due ?? 0),
    },
  };
}

export interface PatientPaymentHistoryEntry {
  id: string;
  amount: number;
  mode: string;
  paid_on: string;
  notes: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string | null;
  is_voided: boolean;
  voided_at: string | null;
  voided_by: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
}

interface PatientPaymentHistoryRow {
  id: string;
  amount: number;
  mode: string;
  paid_on: string;
  notes: string | null;
  created_at: string;
  created_by: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  creator: { full_name: string | null; role?: string | null } | null;
  voider: { full_name: string | null; role?: string | null } | null;
}

/** Newest first (paid_on, then created_at as a tiebreaker for same-day entries). Includes the
 * name of whoever recorded and whoever voided each entry, and an explicit is_voided flag so the
 * UI never has to infer void state from `voided_at !== null` itself. */
export async function fetchPaymentHistory(patientId: string): Promise<ApiResult<PatientPaymentHistoryEntry[]>> {
  const { data, error } = await supabase
    .from("patient_payments")
    .select(
      `id, amount, mode, paid_on, notes, created_at, created_by, voided_at, voided_by, void_reason,
       creator:profiles!patient_payments_created_by_fkey(full_name, role),
       voider:profiles!patient_payments_voided_by_fkey(full_name, role)`,
    )
    .eq("patient_id", patientId)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as unknown as PatientPaymentHistoryRow[];
  return {
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      mode: row.mode,
      paid_on: row.paid_on,
      notes: row.notes,
      created_at: row.created_at,
      created_by: row.created_by,
      created_by_name: row.creator?.role === "super_admin" ? null : (row.creator?.full_name ?? null),
      is_voided: row.voided_at !== null,
      voided_at: row.voided_at,
      voided_by: row.voided_by,
      voided_by_name: row.voider?.role === "super_admin" ? null : (row.voider?.full_name ?? null),
      void_reason: row.void_reason,
    })),
  };
}

export interface InsertPaymentInput {
  patient_id: string;
  clinic_id: string;
  /** Which branch collected the payment -- for a receptionist this must equal their own branch
   * (current_branch_id()), enforced by RLS; an owner may record a payment against any branch of
   * their own clinic. */
  branch_id: string;
  amount: number;
  mode: "cash" | "upi" | "card" | "bank_transfer" | "other";
  /** Defaults to today (current_date) at the database level if omitted. */
  paid_on?: string;
  notes?: string | null;
  /** One value per form opening, sent unchanged on every submit attempt -- collides with
   * patient_payments' partial unique index on this column instead of recording the same payment
   * twice on a slow-network double-tap. */
  client_request_id?: string | null;
}

export interface PatientPaymentRecord {
  id: string;
  clinic_id: string;
  branch_id: string;
  patient_id: string;
  amount: number;
  mode: string;
  paid_on: string;
  notes: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_by: string;
  created_at: string;
}

/** created_by is deliberately never sent here -- it defaults to auth.uid() at the database level
 * (see the patient_payments migration), which is what actually keeps it un-spoofable: a value
 * supplied in the request body would not be. */
export async function insertPayment(input: InsertPaymentInput): Promise<ApiResult<PatientPaymentRecord>> {
  const { data, error } = await supabase
    .from("patient_payments")
    .insert({
      patient_id: input.patient_id,
      clinic_id: input.clinic_id,
      branch_id: input.branch_id,
      amount: input.amount,
      mode: input.mode,
      paid_on: input.paid_on,
      notes: input.notes ?? null,
      client_request_id: input.client_request_id ?? null,
    })
    .select()
    .single();
  if (error && error.code === "23505") {
    return { ok: false, error: "This payment was already saved -- refresh to see it." };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as unknown as PatientPaymentRecord };
}

/** Owner/super_admin only -- enforced by patient_payments_update's RLS policy, not by this
 * function. A receptionist's call will fail here (RLS filters the row out of the UPDATE's USING
 * clause, `.select().single()` then errors on the resulting empty result set rather than
 * silently reporting success), which is what surfaces as a real `.ok === false` result rather
 * than a false-positive "voided" toast. */
export async function voidPayment(paymentId: string, voidReason: string): Promise<ApiResult<PatientPaymentRecord>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Not signed in" };
  }

  const { data, error } = await supabase
    .from("patient_payments")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: userData.user.id,
      void_reason: voidReason,
    })
    .eq("id", paymentId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as unknown as PatientPaymentRecord };
}

// ---------------------------------------------------------------------------
// medicines -- per-clinic medicines master, curated in Settings, modeled on treatment_types.
// SELECT is any authenticated clinic member (owner or receptionist -- a receptionist may need to
// read a prescription that references a medicine); INSERT/UPDATE/DELETE are owner/super_admin
// only, enforced by RLS (medicines_insert/_update/_delete in the Phase 8A migrations), not by
// this file -- a receptionist calling create/update/delete gets 0 rows back, not an error.
//
// fetchMedicines takes no clinic_id: RLS already scopes every row to the caller's own clinic, so
// there's nothing for the client to filter by. No search parameter either -- a clinic has at most
// a few dozen rows, the UI filters client-side.
// ---------------------------------------------------------------------------

export type MedicineRow = Database["public"]["Tables"]["medicines"]["Row"];

export async function fetchMedicines(): Promise<ApiResult<MedicineRow[]>> {
  const { data, error } = await supabase
    .from("medicines")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}

export interface CreateMedicineInput {
  clinic_id: string;
  name: string;
  default_dosage?: string | null;
  default_duration?: string | null;
  notes?: string | null;
}

export async function createMedicine(input: CreateMedicineInput): Promise<ApiResult<MedicineRow>> {
  const { data, error } = await supabase
    .from("medicines")
    .insert({
      clinic_id: input.clinic_id,
      name: input.name,
      default_dosage: input.default_dosage ?? null,
      default_duration: input.default_duration ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export interface UpdateMedicineInput {
  name?: string;
  default_dosage?: string | null;
  default_duration?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export async function updateMedicine(
  medicineId: string,
  input: UpdateMedicineInput,
): Promise<ApiResult<MedicineRow>> {
  const { data, error } = await supabase
    .from("medicines")
    .update(input)
    .eq("id", medicineId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function deleteMedicine(medicineId: string): Promise<ApiResult<{ id: string }>> {
  const { data, error } = await supabase
    .from("medicines")
    .delete()
    .eq("id", medicineId)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// patients -- clinical profile (occupation/height/medical_history). Phase 11A moves these off the
// prescription form and onto the patient master record, entered once and reused across visits.
// prescriptions_snapshot_from_patient() (see the Phase 11A migration) copies the patient's current
// values into a prescription at insert time whenever the form leaves them null, so a past
// prescription's snapshot is never affected by a later edit here. Runs under the caller's normal
// patients_update RLS -- no service role -- so a receptionist calling this outside their own
// branch (or clinic) gets 0 rows back, not an error, same as every other write in this file.
// ---------------------------------------------------------------------------

export type PatientRow = Database["public"]["Tables"]["patients"]["Row"];

// Canonical shape of patients.medical_history. MUST stay in sync with that column's DB default
// (see the Phase 11A migration) -- both this constant and the DB default exist so a patient row
// always has the full checkbox shape, never a partial one a reader has to guard against. Reused
// by the Add/Edit Patient form (a separate task) as well as createPatient below.
export interface MedicalHistory {
  diabetes: boolean;
  hypertension: boolean;
  thyroid: boolean;
  asthma: boolean;
  tuberculosis: boolean;
  cardiac: boolean;
  arthritis: boolean;
  allergies: boolean;
  allergies_detail: string | null;
  other: boolean;
  other_text: string | null;
}

export const DEFAULT_MEDICAL_HISTORY: MedicalHistory = {
  diabetes: false,
  hypertension: false,
  thyroid: false,
  asthma: false,
  tuberculosis: false,
  cardiac: false,
  arthritis: false,
  allergies: false,
  allergies_detail: null,
  other: false,
  other_text: null,
};

export interface CreatePatientInput {
  clinic_id: string;
  branch_id: string;
  name: string;
  mobile: string;
  alt_mobile?: string | null;
  age?: number | null;
  gender?: "male" | "female" | "other" | null;
  address?: string | null;
  notes?: string | null;
  occupation?: string | null;
  height?: string | null;
  /** Omitted entirely (not sent as null) when left undefined, so the NOT NULL DB default
   * (DEFAULT_MEDICAL_HISTORY) applies -- patients.medical_history has no null branch to satisfy. */
  medical_history?: MedicalHistory;
}

export async function createPatient(input: CreatePatientInput): Promise<ApiResult<PatientRow>> {
  const payload = {
    clinic_id: input.clinic_id,
    branch_id: input.branch_id,
    name: input.name,
    mobile: input.mobile,
    alt_mobile: input.alt_mobile ?? null,
    age: input.age ?? null,
    gender: input.gender ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
    occupation: input.occupation ?? null,
    height: input.height ?? null,
    is_active: true,
    ...(input.medical_history !== undefined ? { medical_history: input.medical_history } : {}),
  };
  const { data, error } = await supabase
    .from("patients")
    .insert(payload as Database["public"]["Tables"]["patients"]["Insert"])
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export interface UpdatePatientClinicalProfileInput {
  occupation?: string | null;
  height?: string | null;
  medical_history?: MedicalHistory;
}

export async function updatePatientClinicalProfile(
  patientId: string,
  input: UpdatePatientClinicalProfileInput,
): Promise<ApiResult<PatientRow>> {
  const { data, error } = await supabase
    .from("patients")
    .update(input as Database["public"]["Tables"]["patients"]["Update"])
    .eq("id", patientId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// prescriptions -- digitises the clinic's paper prescription slip. SELECT is any clinic member,
// branch-scoped for a receptionist (they may need to reprint a slip); INSERT/UPDATE/DELETE are
// owner/super_admin only, enforced by RLS (prescriptions_insert/_update/_delete), not by this
// file -- a receptionist calling create/update/delete gets 0 rows back, not an error.
//
// medications/medical_history/investigation are jsonb and deliberately typed loosely here
// (Record<string, unknown> / unknown[]) rather than re-declaring their exact shape -- the
// authoritative shape documentation lives on the columns themselves (see the Phase 9A migration),
// and duplicating it here as a TS type would just be a second place for it to drift out of sync.
// ---------------------------------------------------------------------------

export type PrescriptionRow = Database["public"]["Tables"]["prescriptions"]["Row"];

export interface PrescriptionMedication {
  name: string;
  dosage: string | null;
  duration: string | null;
  notes: string | null;
}

export async function fetchPrescriptionsForPatient(patientId: string): Promise<ApiResult<PrescriptionRow[]>> {
  const { data, error } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("patient_id", patientId)
    .order("prescribed_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}

/** Most recent prescription for a patient, or null if they have none -- separate from
 * fetchPrescriptionsForPatient (which returns the full history) so a caller that only needs the
 * latest one (the consultation page's patient-history context, and a later "copy last Rx"
 * feature) doesn't fetch and discard the rest. Same ordering as fetchPrescriptionsForPatient
 * (prescribed_on desc, then created_at desc), so same-day prescriptions still resolve to
 * whichever was actually written most recently. */
export async function fetchLatestPrescriptionForPatient(
  patientId: string,
): Promise<ApiResult<PrescriptionRow | null>> {
  const { data, error } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("patient_id", patientId)
    .order("prescribed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? null };
}

export async function fetchPrescriptionById(prescriptionId: string): Promise<ApiResult<PrescriptionRow>> {
  const { data, error } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("id", prescriptionId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Prescription not found or not accessible" };
  return { ok: true, data };
}

export interface CreatePrescriptionInput {
  clinic_id: string;
  branch_id: string;
  patient_id: string;
  visit_id?: string | null;
  doctor_name: string;
  prescribed_on?: string;
  occupation?: string | null;
  height?: string | null;
  weight?: string | null;
  blood_pressure?: string | null;
  spo2?: string | null;
  chief_complaint?: string | null;
  medical_history?: Record<string, unknown> | null;
  past_dental_history?: string | null;
  oral_examination?: string | null;
  investigation?: Record<string, unknown> | null;
  provisional_diagnosis?: string | null;
  treatment_plan?: string | null;
  teeth?: number[] | null;
  medications?: PrescriptionMedication[] | null;
  notes?: string | null;
  /** One value per form opening, sent unchanged on every submit attempt -- collides with
   * prescriptions' partial unique index on this column instead of recording the same
   * prescription twice on a slow-network double-tap. */
  client_request_id?: string | null;
}

export async function createPrescription(input: CreatePrescriptionInput): Promise<ApiResult<PrescriptionRow>> {
  const { data, error } = await supabase
    .from("prescriptions")
    .insert(input as unknown as Database["public"]["Tables"]["prescriptions"]["Insert"])
    .select()
    .single();
  if (error && error.code === "23505") {
    // A retry of an already-saved submit (same client_request_id colliding with
    // idx_prescriptions_client_request_id) -- this is success, per the idempotency contract, not
    // an error, so callers that need the row (e.g. Save & Print, which must reuse the original
    // id rather than fail silently) get it back instead of just a "already saved" message.
    if (input.client_request_id) {
      const existing = await supabase
        .from("prescriptions")
        .select("*")
        .eq("client_request_id", input.client_request_id)
        .maybeSingle();
      if (!existing.error && existing.data) {
        return { ok: true, data: existing.data };
      }
    }
    return { ok: false, error: "This prescription was already saved -- refresh to see it." };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export type UpdatePrescriptionInput = Partial<Omit<CreatePrescriptionInput, "clinic_id" | "patient_id">>;

export async function updatePrescription(
  prescriptionId: string,
  input: UpdatePrescriptionInput,
): Promise<ApiResult<PrescriptionRow>> {
  const { data, error } = await supabase
    .from("prescriptions")
    .update(input as unknown as Database["public"]["Tables"]["prescriptions"]["Update"])
    .eq("id", prescriptionId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function deletePrescription(prescriptionId: string): Promise<ApiResult<{ id: string }>> {
  const { data, error } = await supabase
    .from("prescriptions")
    .delete()
    .eq("id", prescriptionId)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
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

// ---------------------------------------------------------------------------
// letterhead -- branding data around a printed prescription (Phase 10A). The layout itself is
// fixed and owned by us; this is data only, never markup. logo_both_sides is a display flag over
// the existing clinics.logo_url (same clinic-logos upload flow above) -- not a second logo.
//
// RLS: clinics_select (any clinic member, own clinic only) / clinics_owner_write (owner only) --
// enforced by RLS, not by this file. protect_clinic_billing_fields is a blocklist of named
// subscription fields (confirmed from source in Step 0), so letterhead is unprotected/editable
// by an owner by default; a receptionist's update call gets 0 rows back, not an error.
// ---------------------------------------------------------------------------

export interface ClinicLetterheadDoctor {
  name: string;
  qualification: string | null;
}

export interface ClinicLetterhead {
  regd_no?: string | null;
  tagline?: string | null;
  doctors?: ClinicLetterheadDoctor[];
  timings?: string | null;
  sunday_timings?: string | null;
  footer_note?: string | null;
  logo_both_sides?: boolean;
}

/** Everything the print page's header/footer needs, in one call -- a half-loaded print header is
 * worse than a slow one, so this deliberately isn't split across several fetches. */
export interface ClinicLetterheadData {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  logo_url: string | null;
  letterhead: ClinicLetterhead;
  show_branding: boolean;
  branding_domain: string | null;
}

export async function fetchClinicLetterheadData(clinicId: string): Promise<ApiResult<ClinicLetterheadData>> {
  const { data, error } = await supabase
    .from("clinics")
    .select("id, name, phone, address, email, logo_url, letterhead, show_branding, branding_domain")
    .eq("id", clinicId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Clinic not found or not accessible" };
  return {
    ok: true,
    data: { ...data, letterhead: (data.letterhead ?? {}) as ClinicLetterhead } as ClinicLetterheadData,
  };
}

export async function updateClinicLetterhead(
  clinicId: string,
  letterhead: ClinicLetterhead,
): Promise<ApiResult<{ letterhead: ClinicLetterhead }>> {
  const { data, error } = await supabase
    .from("clinics")
    .update({ letterhead: letterhead as unknown as Database["public"]["Tables"]["clinics"]["Update"]["letterhead"] })
    .eq("id", clinicId)
    .select("letterhead")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { letterhead: (data.letterhead ?? {}) as ClinicLetterhead } };
}

// ---------------------------------------------------------------------------
// Today's walk-in day-sheet (Phase 14A). Plain RLS-scoped inserts/updates throughout -- no RPC --
// appointments_insert/appointments_update already enforce clinic/branch/patient ownership.
// ---------------------------------------------------------------------------

export type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];

export type AppointmentStatus =
  | "scheduled"
  | "completed"
  | "no_show"
  | "cancelled"
  | "waiting"
  | "in_chair"
  | "done";

export interface CreateWalkInInput {
  clinic_id: string;
  branch_id: string;
  patient_id: string;
}

/** Adds a walk-in to today's in-clinic queue: status='waiting', checked_in_at=scheduled_at=now().
 * "+ Walk-in" on the Today screen calls this directly. */
export async function createWalkIn(input: CreateWalkInInput): Promise<ApiResult<AppointmentRow>> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      clinic_id: input.clinic_id,
      branch_id: input.branch_id,
      patient_id: input.patient_id,
      scheduled_at: now,
      checked_in_at: now,
      status: "waiting",
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export interface CreatePatientAndQueueInput extends CreatePatientInput {
  addToTodayQueue?: boolean;
}

export interface CreatePatientAndQueueResult {
  patient: PatientRow;
  queued: boolean;
  queueError?: string;
}

/** Creates a patient and, when requested, adds them to today's walk-in queue.
 * If the walk-in step fails, the already-created patient is still returned as a success --
 * queue failure is surfaced via `queueError`, not as an overall error. */
export async function createPatientAndQueue(
  input: CreatePatientAndQueueInput,
): Promise<ApiResult<CreatePatientAndQueueResult>> {
  const { addToTodayQueue, ...patientInput } = input;
  const patientRes = await createPatient(patientInput);
  if (!patientRes.ok) return patientRes;

  const patient = patientRes.data;
  if (!addToTodayQueue) {
    return { ok: true, data: { patient, queued: false } };
  }

  const walkInRes = await createWalkIn({
    clinic_id: input.clinic_id,
    branch_id: input.branch_id,
    patient_id: patient.id,
  });
  if (!walkInRes.ok) {
    return { ok: true, data: { patient, queued: false, queueError: walkInRes.error } };
  }

  return { ok: true, data: { patient, queued: true } };
}

/** Moves an appointment through the walk-in queue (waiting -> in_chair -> done). */
export async function updateAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
): Promise<ApiResult<{ id: string; status: string }>> {
  const { data, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId)
    .select("id, status")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/** Links an appointment to the visit eventually recorded from it. Not called from
 * ConsultationPage yet -- wiring that in is a follow-up phase once this function is confirmed
 * (Phase 14A brief, Task 5). */
export async function setAppointmentVisitId(
  appointmentId: string,
  visitId: string,
): Promise<ApiResult<{ id: string; visit_id: string | null }>> {
  const { data, error } = await supabase
    .from("appointments")
    .update({ visit_id: visitId })
    .eq("id", appointmentId)
    .select("id, visit_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export interface DaySheetEntry {
  appointment_id: string;
  status: string;
  checked_in_at: string | null;
  scheduled_at: string;
  visit_id: string | null;
  patient_id: string;
  patient_name: string;
  patient_age: number | null;
  patient_gender: string | null;
  patient_mobile: string;
  visit_exists_today: boolean;
  /** See fetchTodayDaySheet's doc comment -- this is a patient-level "any balance outstanding"
   * flag, not a per-visit one; patient_payments has no visit_id to attribute a payment to a
   * specific visit. */
  payment_due: boolean;
}

interface DaySheetAppointmentRow {
  id: string;
  status: string;
  checked_in_at: string | null;
  scheduled_at: string;
  visit_id: string | null;
  patient_id: string;
  patient: { name: string; age: number | null; gender: string | null; mobile: string } | null;
}

/** Today's in-clinic queue for the current clinic -- receptionists see their own branch, owners
 * see every branch (same scoping as appointments_select), ordered by checked_in_at (old-style
 * scheduled/recall appointments with no checked_in_at sort last).
 *
 * visit_exists_today: true once visit_id is set (Task 5), or -- before that link is made -- by
 * falling back to "does this patient have a visit dated today".
 *
 * payment_due reuses patient_billing_summary (Phase 6A's view) rather than reimplementing the
 * due-amount math, per the brief. That view is patient-level (sum of all visits vs. all
 * payments), and patient_payments has no visit_id column to tie a payment to one specific visit --
 * so this flag really answers "does this patient have any outstanding balance at all", not "is
 * THIS visit specifically unpaid". Those coincide for a patient with a single visit (the common
 * walk-in case); for a patient with older unpaid visits, today's visit will also show as due even
 * if it alone was paid in full. */
export async function fetchTodayDaySheet(): Promise<ApiResult<DaySheetEntry[]>> {
  const todayStr = todayIST();
  const startOfDay = new Date(`${todayStr}T00:00:00+05:30`);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const { data: appts, error: apptError } = await supabase
    .from("appointments")
    .select(
      "id, status, checked_in_at, scheduled_at, visit_id, patient_id, patient:patients(name, age, gender, mobile)",
    )
    .gte("scheduled_at", startOfDay.toISOString())
    .lt("scheduled_at", endOfDay.toISOString())
    .order("checked_in_at", { ascending: true, nullsFirst: false });
  if (apptError) return { ok: false, error: apptError.message };

  const rows = (appts ?? []) as unknown as DaySheetAppointmentRow[];
  if (rows.length === 0) return { ok: true, data: [] };

  const patientIds = Array.from(new Set(rows.map((r) => r.patient_id)));

  const { data: visitsToday, error: visitsError } = await supabase
    .from("visits")
    .select("patient_id")
    .in("patient_id", patientIds)
    .eq("visit_date", todayStr);
  if (visitsError) return { ok: false, error: visitsError.message };
  const patientsWithVisitToday = new Set((visitsToday ?? []).map((v) => v.patient_id as string));

  const { data: billing, error: billingError } = await supabase
    .from("patient_billing_summary")
    .select("patient_id, due")
    .in("patient_id", patientIds);
  if (billingError) return { ok: false, error: billingError.message };
  const dueByPatient = new Map((billing ?? []).map((b) => [b.patient_id as string, Number(b.due ?? 0)]));

  return {
    ok: true,
    data: rows.map((r) => ({
      appointment_id: r.id,
      status: r.status,
      checked_in_at: r.checked_in_at,
      scheduled_at: r.scheduled_at,
      visit_id: r.visit_id,
      patient_id: r.patient_id,
      patient_name: r.patient?.name ?? "",
      patient_age: r.patient?.age ?? null,
      patient_gender: r.patient?.gender ?? null,
      patient_mobile: r.patient?.mobile ?? "",
      visit_exists_today: r.visit_id !== null || patientsWithVisitToday.has(r.patient_id),
      payment_due: (dueByPatient.get(r.patient_id) ?? 0) > 0,
    })),
  };
}

export interface AppointmentCheckinVitals {
  checkin_weight: string | null;
  checkin_blood_pressure: string | null;
  checkin_spo2: string | null;
  checkin_chief_complaint: string | null;
  checkin_past_dental_history: string | null;
}

/** Fetches the latest check-in vitals for a patient from active queue appointments (status waiting or in_chair). */
export async function fetchLatestCheckinVitalsForPatient(
  patientId: string,
): Promise<ApiResult<AppointmentCheckinVitals | null>> {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "checkin_weight, checkin_blood_pressure, checkin_spo2, checkin_chief_complaint, checkin_past_dental_history",
    )
    .eq("patient_id", patientId)
    .in("status", ["waiting", "in_chair"])
    .not("checked_in_at", "is", null)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as AppointmentCheckinVitals | null };
}

export interface CheckInAppointmentInput {
  appointment_id: string;
  weight?: string | null;
  blood_pressure?: string | null;
  spo2?: string | null;
  chief_complaint?: string | null;
  past_dental_history?: string | null;
}

/** Check in a booked appointment with optional vitals and complaint, transitioning it to 'waiting'. */
export async function checkInAppointment(
  input: CheckInAppointmentInput,
): Promise<ApiResult<{ id: string }>> {
  const { data, error } = await (supabase.rpc as any)("check_in_appointment", {
    p_appointment_id: input.appointment_id,
    p_weight: input.weight ?? null,
    p_blood_pressure: input.blood_pressure ?? null,
    p_spo2: input.spo2 ?? null,
    p_chief_complaint: input.chief_complaint ?? null,
    p_past_dental_history: input.past_dental_history ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data as string } };
}

