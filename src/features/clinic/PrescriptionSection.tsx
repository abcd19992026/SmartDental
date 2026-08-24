import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Pill } from "lucide-react";
import { fetchMedicines, type MedicineRow, type PrescriptionMedication } from "@/lib/clinic-api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Draft shape -- mirrors the paper slip, and maps directly onto 9A's prescriptions columns.
// Kept as a controlled value/onChange pair (like every other form piece in this codebase) so
// this component works identically standalone or embedded inside a larger form.
// ---------------------------------------------------------------------------

export interface MedicalHistoryState {
  diabetes: boolean;
  hypertension: boolean;
  thyroid: boolean;
  asthma: boolean;
  tuberculosis: boolean;
  cardiac: boolean;
  allergies: boolean;
  arthritis: boolean;
  other: boolean;
  other_text: string;
}

export interface InvestigationState {
  iopa: boolean;
  rvg: boolean;
  opg: boolean;
  blood_other: boolean;
  notes: string;
}

export interface MedicationRowState {
  name: string;
  dosage: string;
  duration: string;
  notes: string;
}

export interface PrescriptionDraft {
  occupation: string;
  height: string;
  weight: string;
  blood_pressure: string;
  spo2: string;
  chief_complaint: string;
  medical_history: MedicalHistoryState;
  past_dental_history: string;
  oral_examination: string;
  investigation: InvestigationState;
  provisional_diagnosis: string;
  treatment_plan: string;
  medications: MedicationRowState[];
  notes: string;
  doctor_name: string;
}

export function emptyPrescriptionDraft(doctorName: string): PrescriptionDraft {
  return {
    occupation: "",
    height: "",
    weight: "",
    blood_pressure: "",
    spo2: "",
    chief_complaint: "",
    medical_history: {
      diabetes: false,
      hypertension: false,
      thyroid: false,
      asthma: false,
      tuberculosis: false,
      cardiac: false,
      allergies: false,
      arthritis: false,
      other: false,
      other_text: "",
    },
    past_dental_history: "",
    oral_examination: "",
    investigation: { iopa: false, rvg: false, opg: false, blood_other: false, notes: "" },
    provisional_diagnosis: "",
    treatment_plan: "",
    medications: [],
    notes: "",
    doctor_name: doctorName,
  };
}

/** A prescription section that was never opened, or opened and left untouched, must not create
 * an empty prescription row -- a follow-up visit usually has no new prescription at all. */
export function isPrescriptionDraftEmpty(d: PrescriptionDraft): boolean {
  const mh = d.medical_history;
  const inv = d.investigation;
  return (
    !d.occupation.trim() &&
    !d.height.trim() &&
    !d.weight.trim() &&
    !d.blood_pressure.trim() &&
    !d.spo2.trim() &&
    !d.chief_complaint.trim() &&
    !mh.diabetes &&
    !mh.hypertension &&
    !mh.thyroid &&
    !mh.asthma &&
    !mh.tuberculosis &&
    !mh.cardiac &&
    !mh.allergies &&
    !mh.arthritis &&
    !mh.other &&
    !mh.other_text.trim() &&
    !d.past_dental_history.trim() &&
    !d.oral_examination.trim() &&
    !inv.iopa &&
    !inv.rvg &&
    !inv.opg &&
    !inv.blood_other &&
    !inv.notes.trim() &&
    !d.provisional_diagnosis.trim() &&
    !d.treatment_plan.trim() &&
    d.medications.every((m) => !m.name.trim()) &&
    !d.notes.trim()
  );
}

/** Converts the draft's medical_history to the exact jsonb shape documented on the column
 * (Phase 9A). other_text only carries a value when "other" is actually toggled on. */
export function draftToMedicalHistoryJson(mh: MedicalHistoryState) {
  return {
    diabetes: mh.diabetes,
    hypertension: mh.hypertension,
    thyroid: mh.thyroid,
    asthma: mh.asthma,
    tuberculosis: mh.tuberculosis,
    cardiac: mh.cardiac,
    allergies: mh.allergies,
    arthritis: mh.arthritis,
    other: mh.other,
    other_text: mh.other ? mh.other_text.trim() || null : null,
  };
}

export function draftToInvestigationJson(inv: InvestigationState) {
  return {
    iopa: inv.iopa,
    rvg: inv.rvg,
    opg: inv.opg,
    blood_other: inv.blood_other,
    notes: inv.notes.trim() || null,
  };
}

/** Rows with no medicine name are dropped, not stored as blanks. Name is always sent as the
 * text the dentist typed or picked, never a medicines.id -- a prescription is a point-in-time
 * document (see the 9A design note on this exact table). */
export function draftToMedications(rows: MedicationRowState[]): PrescriptionMedication[] {
  return rows
    .filter((m) => m.name.trim())
    .map((m) => ({
      name: m.name.trim(),
      dosage: m.dosage.trim() || null,
      duration: m.duration.trim() || null,
      notes: m.notes.trim() || null,
    }));
}

const textareaClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground";

function TogglePill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

interface MedicationRowEditorProps {
  index: number;
  row: MedicationRowState;
  allMedications: MedicationRowState[];
  medicines: MedicineRow[];
  onChange: (partial: Partial<MedicationRowState>) => void;
  onSelectMedicine: (medicine: MedicineRow) => void;
  onRemove: () => void;
}

function MedicationRowEditor({
  index,
  row,
  allMedications,
  medicines,
  onChange,
  onSelectMedicine,
  onRemove,
}: MedicationRowEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = row.name.trim().toLowerCase();
    if (!q) return medicines;
    return medicines.filter((m) => m.name.toLowerCase().includes(q));
  }, [medicines, row.name]);

  // Check if current row's name matches another row (case-insensitive & trimmed)
  const isDuplicate = useMemo(() => {
    const trimmed = row.name.trim().toLowerCase();
    if (!trimmed) return false;
    return allMedications.some((m, idx) => idx !== index && m.name.trim().toLowerCase() === trimmed);
  }, [row.name, allMedications, index]);

  // Clear duplicate warning when row name is edited to non-duplicate
  useEffect(() => {
    if (!isDuplicate) {
      setDuplicateWarning(null);
    }
  }, [isDuplicate]);

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-medicine-item]");
      const target = items[highlightedIndex] as HTMLElement | undefined;
      if (target) {
        target.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  function handleSelectMedicine(m: MedicineRow) {
    const targetName = m.name.trim().toLowerCase();
    const alreadyExists = allMedications.some(
      (other, idx) => idx !== index && other.name.trim().toLowerCase() === targetName,
    );
    if (alreadyExists) {
      setDuplicateWarning("This medicine is already added");
      setPickerOpen(false);
      return;
    }
    setDuplicateWarning(null);
    onSelectMedicine(m);
    setPickerOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!pickerOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setPickerOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelectMedicine(suggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setPickerOpen(false);
    }
  }

  const showWarning = isDuplicate || Boolean(duplicateWarning);

  return (
    <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] items-start rounded-lg border border-border bg-muted/20 p-2.5">
      <div className="relative" ref={containerRef}>
        <Input
          placeholder="Medicine name"
          value={row.name}
          onChange={(e) => {
            setDuplicateWarning(null);
            onChange({ name: e.target.value });
          }}
          onFocus={() => {
            setPickerOpen(true);
            setHighlightedIndex(-1);
          }}
          onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
          onKeyDown={handleKeyDown}
          className={cn(showWarning && "border-amber-500/70 focus-visible:ring-amber-500/30")}
        />
        {showWarning && (
          <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-1 pl-0.5">
            This medicine is already added
          </p>
        )}
        {pickerOpen && suggestions.length > 0 && (
          <div
            ref={listRef}
            className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-md"
          >
            {suggestions.map((m, idx) => (
              <button
                key={m.id}
                type="button"
                data-medicine-item
                onMouseEnter={() => setHighlightedIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur before click handler
                  handleSelectMedicine(m);
                }}
                className={cn(
                  "flex w-full flex-col items-start px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
                  idx === highlightedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted text-foreground",
                )}
              >
                <span className="font-medium">{m.name}</span>
                {(m.default_dosage || m.default_duration || m.notes) && (
                  <span className="text-muted-foreground text-[11px]">
                    {[m.default_dosage, m.default_duration, m.notes].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <Input placeholder="Dosage" value={row.dosage} onChange={(e) => onChange({ dosage: e.target.value })} />
      <Input placeholder="Duration" value={row.duration} onChange={(e) => onChange({ duration: e.target.value })} />
      <Input placeholder="Notes" value={row.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="text-destructive hover:bg-destructive/10 shrink-0"
        title="Remove medicine"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface PrescriptionSectionProps {
  value: PrescriptionDraft;
  onChange: (next: PrescriptionDraft) => void;
}

export function PrescriptionSection({ value, onChange }: PrescriptionSectionProps) {
  const [medicines, setMedicines] = useState<MedicineRow[]>([]);

  useEffect(() => {
    let active = true;
    fetchMedicines().then((res) => {
      if (active && res.ok) setMedicines(res.data);
    });
    return () => {
      active = false;
    };
  }, []);

  function patch(partial: Partial<PrescriptionDraft>) {
    onChange({ ...value, ...partial });
  }
  function patchMedicalHistory(partial: Partial<MedicalHistoryState>) {
    patch({ medical_history: { ...value.medical_history, ...partial } });
  }
  function patchInvestigation(partial: Partial<InvestigationState>) {
    patch({ investigation: { ...value.investigation, ...partial } });
  }

  function addMedicationRow() {
    patch({ medications: [...value.medications, { name: "", dosage: "", duration: "", notes: "" }] });
  }
  function removeMedicationRow(index: number) {
    patch({ medications: value.medications.filter((_, i) => i !== index) });
  }
  function updateMedicationRow(index: number, partial: Partial<MedicationRowState>) {
    patch({ medications: value.medications.map((m, i) => (i === index ? { ...m, ...partial } : m)) });
  }
  function selectMedicineForRow(index: number, medicine: MedicineRow) {
    // Always fills from the saved defaults (blank if the medicine has none) -- overwriting
    // whatever was there, since picking a medicine is the "start fresh from this one" action.
    // Still fully editable afterwards, per the brief.
    updateMedicationRow(index, {
      name: medicine.name,
      dosage: medicine.default_dosage ?? "",
      duration: medicine.default_duration ?? "",
      notes: medicine.notes ?? "",
    });
  }

  const mh = value.medical_history;
  const inv = value.investigation;

  return (
    <div className="flex flex-col gap-5">
      {/* Vitals */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-foreground">Vitals</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Occupation" value={value.occupation} onChange={(e) => patch({ occupation: e.target.value })} />
          <Input placeholder="Height" value={value.height} onChange={(e) => patch({ height: e.target.value })} />
          <Input placeholder="Weight" value={value.weight} onChange={(e) => patch({ weight: e.target.value })} />
          <Input
            placeholder="Blood Pressure"
            value={value.blood_pressure}
            onChange={(e) => patch({ blood_pressure: e.target.value })}
          />
          <Input placeholder="SpO2" value={value.spo2} onChange={(e) => patch({ spo2: e.target.value })} />
        </div>
      </div>

      {/* Chief complaint */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rx-chief-complaint">Chief Complaint</Label>
        <textarea
          id="rx-chief-complaint"
          rows={2}
          className={textareaClass}
          value={value.chief_complaint}
          onChange={(e) => patch({ chief_complaint: e.target.value })}
        />
      </div>

      {/* Medical history */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-foreground">Medical History</Label>
        <div className="flex flex-wrap gap-1.5">
          <TogglePill active={mh.diabetes} label="Diabetes" onClick={() => patchMedicalHistory({ diabetes: !mh.diabetes })} />
          <TogglePill
            active={mh.hypertension}
            label="Hypertension"
            onClick={() => patchMedicalHistory({ hypertension: !mh.hypertension })}
          />
          <TogglePill active={mh.thyroid} label="Thyroid" onClick={() => patchMedicalHistory({ thyroid: !mh.thyroid })} />
          <TogglePill active={mh.asthma} label="Asthma" onClick={() => patchMedicalHistory({ asthma: !mh.asthma })} />
          <TogglePill
            active={mh.tuberculosis}
            label="Tuberculosis"
            onClick={() => patchMedicalHistory({ tuberculosis: !mh.tuberculosis })}
          />
          <TogglePill active={mh.cardiac} label="Cardiac" onClick={() => patchMedicalHistory({ cardiac: !mh.cardiac })} />
          <TogglePill
            active={mh.allergies}
            label="Allergies"
            onClick={() => patchMedicalHistory({ allergies: !mh.allergies })}
          />
          <TogglePill
            active={mh.arthritis}
            label="Arthritis"
            onClick={() => patchMedicalHistory({ arthritis: !mh.arthritis })}
          />
          <TogglePill active={mh.other} label="Other" onClick={() => patchMedicalHistory({ other: !mh.other })} />
        </div>
        {mh.other && (
          <Input
            placeholder="Specify other condition"
            value={mh.other_text}
            onChange={(e) => patchMedicalHistory({ other_text: e.target.value })}
          />
        )}
      </div>

      {/* Past dental history */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rx-past-dental">Past Dental History</Label>
        <textarea
          id="rx-past-dental"
          rows={2}
          className={textareaClass}
          value={value.past_dental_history}
          onChange={(e) => patch({ past_dental_history: e.target.value })}
        />
      </div>

      {/* Oral examination */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rx-oral-exam">Oral Examination</Label>
        <textarea
          id="rx-oral-exam"
          rows={2}
          className={textareaClass}
          value={value.oral_examination}
          onChange={(e) => patch({ oral_examination: e.target.value })}
        />
      </div>

      {/* Investigation */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-foreground">Investigation</Label>
        <div className="flex flex-wrap gap-1.5">
          <TogglePill active={inv.iopa} label="IOPA" onClick={() => patchInvestigation({ iopa: !inv.iopa })} />
          <TogglePill active={inv.rvg} label="RVG" onClick={() => patchInvestigation({ rvg: !inv.rvg })} />
          <TogglePill active={inv.opg} label="OPG" onClick={() => patchInvestigation({ opg: !inv.opg })} />
          <TogglePill
            active={inv.blood_other}
            label="Blood / Other"
            onClick={() => patchInvestigation({ blood_other: !inv.blood_other })}
          />
        </div>
        <Input
          placeholder="Investigation notes"
          value={inv.notes}
          onChange={(e) => patchInvestigation({ notes: e.target.value })}
        />
      </div>

      {/* Provisional diagnosis */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rx-diagnosis">Provisional Diagnosis</Label>
        <Input
          id="rx-diagnosis"
          value={value.provisional_diagnosis}
          onChange={(e) => patch({ provisional_diagnosis: e.target.value })}
        />
      </div>

      {/* Treatment plan */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rx-treatment-plan">Treatment Plan</Label>
        <textarea
          id="rx-treatment-plan"
          rows={2}
          className={textareaClass}
          value={value.treatment_plan}
          onChange={(e) => patch({ treatment_plan: e.target.value })}
        />
      </div>

      {/* Rx */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Pill className="h-3.5 w-3.5 text-primary" />
          Rx (Medicines)
        </Label>
        <div className="flex flex-col gap-2">
          {value.medications.map((m, i) => (
            <MedicationRowEditor
              key={i}
              index={i}
              row={m}
              allMedications={value.medications}
              medicines={medicines}
              onChange={(partial) => updateMedicationRow(i, partial)}
              onSelectMedicine={(medicine) => selectMedicineForRow(i, medicine)}
              onRemove={() => removeMedicationRow(i)}
            />
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addMedicationRow} className="self-start">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Medicine
        </Button>
      </div>

      {/* Doctor name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rx-doctor-name">Doctor Name *</Label>
        <Input
          id="rx-doctor-name"
          value={value.doctor_name}
          onChange={(e) => patch({ doctor_name: e.target.value })}
          placeholder="Prescribing dentist"
        />
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rx-notes">Notes</Label>
        <textarea id="rx-notes" rows={2} className={textareaClass} value={value.notes} onChange={(e) => patch({ notes: e.target.value })} />
      </div>
    </div>
  );
}
