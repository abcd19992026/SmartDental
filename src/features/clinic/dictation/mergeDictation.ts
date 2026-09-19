import type { PrescriptionDraft, MedicationRowState } from "@/features/clinic/PrescriptionSection";
import type { TranscribeConsultationOutput } from "@/lib/clinic-api";

/** The five narrative PrescriptionDraft keys a dictation can fill -- "advice" from the API maps
 * to the draft's `notes` field (see the 11A report: notes IS the advice field). */
export const AI_FILLABLE_FIELDS = ["chief_complaint", "oral_examination", "provisional_diagnosis", "treatment_plan", "notes"] as const;
export type AiFillableField = (typeof AI_FILLABLE_FIELDS)[number];

export interface DictationMergeResult {
  /** Fields to write straight into rxDraft (filled-from-empty or appended-to-AI-owned). */
  draftPatch: Partial<Pick<PrescriptionDraft, AiFillableField>>;
  /** Fields that are AI-owned after this merge (superset of what was already AI-owned, plus any
   * newly-filled-from-empty field). Caller replaces its aiFilledFields set with this. */
  aiFilledFields: Set<AiFillableField>;
  /** A field the doctor already edited (not AI-owned) where the AI also returned something --
   * shown as a dismissible suggestion beside the field, never written into the draft. */
  suggestions: Partial<Record<AiFillableField, string>>;
  /** New medication rows to append (already deduped against rows already on the draft). */
  newMedications: MedicationRowState[];
  /** Lowercased names of the newMedications rows, for the caller to mark as AI-filled the same
   * way fields are -- medicines have no stable row id, so name (case-insensitive) is the identity. */
  newMedicationNames: string[];
  /** As heard, not matched to anything in the clinic's list -- shown as a note, never auto-added. */
  unmatchedMedicines: string[];
}

const FIELD_TO_API_KEY: Record<AiFillableField, keyof TranscribeConsultationOutput["fields"]> = {
  chief_complaint: "chief_complaint",
  oral_examination: "oral_examination",
  provisional_diagnosis: "provisional_diagnosis",
  treatment_plan: "treatment_plan",
  notes: "advice",
};

/** Pure merge function -- the whole trust rule of this feature lives here: the AI never
 * overwrites a human's words, not in any branch. Called once per finished dictation; safe to
 * call repeatedly across multiple dictations in one consultation (nothing here resets state that
 * belongs to a previous run -- the caller owns aiFilledFields/medications and just applies the
 * returned patch on top). */
export function mergeDictationResult(
  current: PrescriptionDraft,
  aiFilledFields: ReadonlySet<AiFillableField>,
  result: TranscribeConsultationOutput,
): DictationMergeResult {
  const draftPatch: Partial<Pick<PrescriptionDraft, AiFillableField>> = {};
  const nextAiFilledFields = new Set(aiFilledFields);
  const suggestions: Partial<Record<AiFillableField, string>> = {};

  for (const field of AI_FILLABLE_FIELDS) {
    const apiKey = FIELD_TO_API_KEY[field];
    const aiValue = result.fields[apiKey];
    if (aiValue === null || aiValue === undefined) continue;
    const trimmedAiValue = aiValue.trim();
    if (trimmedAiValue === "") continue;

    const currentValue = current[field];
    if (currentValue.trim() === "") {
      draftPatch[field] = trimmedAiValue;
      nextAiFilledFields.add(field);
    } else if (aiFilledFields.has(field)) {
      draftPatch[field] = `${currentValue} ${trimmedAiValue}`.trim();
      nextAiFilledFields.add(field);
    } else {
      // Doctor-owned -- never touched, offered as a dismissible suggestion instead.
      suggestions[field] = trimmedAiValue;
    }
  }

  const existingNamesLower = new Set(current.medications.filter((m) => m.name.trim() !== "").map((m) => m.name.trim().toLowerCase()));
  const newMedications: MedicationRowState[] = [];
  const newMedicationNames: string[] = [];
  for (const med of result.medicines) {
    const nameLower = med.name.trim().toLowerCase();
    if (nameLower === "" || existingNamesLower.has(nameLower)) continue;
    existingNamesLower.add(nameLower);
    newMedications.push({ name: med.name, dosage: med.dosage ?? "", duration: med.duration ?? "", notes: "" });
    newMedicationNames.push(nameLower);
  }

  return {
    draftPatch,
    aiFilledFields: nextAiFilledFields,
    suggestions,
    newMedications,
    newMedicationNames,
    unmatchedMedicines: result.unmatched_medicines,
  };
}
