import type { ApiResult } from "@/lib/admin-api";
import { supabase } from "@/lib/supabase";

// Clinic-side (owner/receptionist) operations, kept separate from admin-api.ts's super-admin
// surface -- these run under the caller's own RLS-scoped session, never a service-role client.
// Same discriminated-result shape as admin-api.ts so callers branch on `.ok` the same way.

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
  const { data, error } = await supabase.rpc("create_visit_with_recall", {
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
