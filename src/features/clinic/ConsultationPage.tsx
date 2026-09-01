import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronDown,
  ClipboardPlus,
  CreditCard,
  FileText,
  HeartPulse,
  IndianRupee,
  Loader2,
  Pill,
  Plus,
  Printer,
  Stethoscope,
  Trash2,
  User,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import {
  createVisitWithRecall,
  createPrescription,
  fetchLatestPrescriptionForPatient,
  fetchLatestCheckinVitalsForPatient,
  fetchMedicines,
  isAlreadySavedError,
  updateAppointmentStatus,
  DEFAULT_MEDICAL_HISTORY,
  type MedicalHistory,
  type MedicineRow,
  type PatientRow,
  type PrescriptionMedication,
  type PrescriptionRow,
} from "@/lib/clinic-api";
import { todayIST, formatDateIST } from "@/lib/dates";
import { cn, formatINR } from "@/lib/utils";
import { ToothChart } from "@/features/clinic/dental-chart/ToothChart";
import {
  emptyPrescriptionDraft,
  isPrescriptionDraftEmpty,
  draftToInvestigationJson,
  draftToMedications,
  type InvestigationState,
  type MedicationRowState,
  type PrescriptionDraft,
} from "@/features/clinic/PrescriptionSection";
import { AddPaymentModal } from "@/features/clinic/billing/AddPaymentModal";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type TreatmentTypeRow = Database["public"]["Tables"]["treatment_types"]["Row"];
type VisitRow = Database["public"]["Tables"]["visits"]["Row"];

const textareaClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground";

function TogglePill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer select-none",
        active
          ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30"
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

  const isDuplicate = useMemo(() => {
    const trimmed = row.name.trim().toLowerCase();
    if (!trimmed) return false;
    return allMedications.some((m, idx) => idx !== index && m.name.trim().toLowerCase() === trimmed);
  }, [row.name, allMedications, index]);

  useEffect(() => {
    if (!isDuplicate) {
      setDuplicateWarning(null);
    }
  }, [isDuplicate]);

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
            className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-md"
          >
            {suggestions.map((m, idx) => (
              <button
                key={m.id}
                type="button"
                data-medicine-item
                onMouseEnter={() => setHighlightedIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
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
      <Input placeholder="Dosage (e.g. 1-0-1)" value={row.dosage} onChange={(e) => onChange({ dosage: e.target.value })} />
      <Input placeholder="Duration (e.g. 5 days)" value={row.duration} onChange={(e) => onChange({ duration: e.target.value })} />
      <Input placeholder="Instructions" value={row.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="text-destructive hover:bg-destructive/10 shrink-0"
        title="Remove medicine"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function ConsultationPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const [searchParams] = useSearchParams();
  const visitId = searchParams.get("visitId");
  // Present when opened via "Open" on an in_chair entry in the in-clinic queue (TodayPage) --
  // absent in existing-visit mode (?visitId=) and everywhere else this page can be reached from.
  const appointmentId = searchParams.get("appointmentId");
  const isExistingVisitMode = Boolean(visitId);

  const navigate = useNavigate();
  const { profile } = useAuth();
  const { success: toastSuccess, toast } = useToast();

  const canPrescribe = profile?.role === "owner" || profile?.role === "super_admin";

  // ---- Load state ----
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [existingVisit, setExistingVisit] = useState<VisitRow | null>(null);
  const [latestPrescription, setLatestPrescription] = useState<PrescriptionRow | null>(null);
  const [treatmentTypes, setTreatmentTypes] = useState<TreatmentTypeRow[]>([]);
  const [medicines, setMedicines] = useState<MedicineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- Accordion active section state (one open at a time) ----
  const [openSection, setOpenSection] = useState<string | null>("today_status");

  function toggleSection(sectionId: string) {
    setOpenSection((curr) => (curr === sectionId ? null : sectionId));
  }

  function goToSection(sectionId: string) {
    setOpenSection(sectionId);
    setTimeout(() => {
      const el = document.getElementById(`section-${sectionId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);
  }

  useEffect(() => {
    if (!patientId) return;
    let active = true;

    (async () => {
      setLoading(true);
      setLoadError(null);

      const [patientRes, ttRes, latestRxRes, visitRes, medRes, checkinVitalsRes] = await Promise.all([
        supabase.from("patients").select("*").eq("id", patientId).maybeSingle(),
        supabase.from("treatment_types").select("*").eq("is_active", true).order("sort_order"),
        fetchLatestPrescriptionForPatient(patientId),
        visitId
          ? supabase.from("visits").select("*").eq("id", visitId).eq("patient_id", patientId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        fetchMedicines(),
        !visitId
          ? fetchLatestCheckinVitalsForPatient(patientId)
          : Promise.resolve({ ok: true, data: null }),
      ]);
      if (!active) return;

      if (patientRes.error || !patientRes.data) {
        setLoadError(patientRes.error?.message ?? "Patient not found or not accessible.");
        setLoading(false);
        return;
      }
      if (visitId && (visitRes.error || !visitRes.data)) {
        setLoadError(visitRes.error?.message ?? "Visit not found or not accessible.");
        setLoading(false);
        return;
      }

      setPatient(patientRes.data);
      if (ttRes.data) setTreatmentTypes(ttRes.data);
      if (latestRxRes.ok) setLatestPrescription(latestRxRes.data);
      if (visitId) setExistingVisit(visitRes.data as VisitRow);
      if (medRes.ok) setMedicines(medRes.data);

      if (checkinVitalsRes.ok && checkinVitalsRes.data) {
        const vitals = checkinVitalsRes.data;
        setRxDraft((prev) => ({
          ...prev,
          weight: vitals.checkin_weight ?? prev.weight,
          blood_pressure: vitals.checkin_blood_pressure ?? prev.blood_pressure,
          spo2: vitals.checkin_spo2 ?? prev.spo2,
          chief_complaint: vitals.checkin_chief_complaint ?? prev.chief_complaint,
          past_dental_history: vitals.checkin_past_dental_history ?? prev.past_dental_history,
        }));
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [patientId, visitId]);

  const patientMedicalHistory: MedicalHistory = useMemo(() => {
    if (patient?.medical_history && typeof patient.medical_history === "object") {
      return { ...DEFAULT_MEDICAL_HISTORY, ...(patient.medical_history as unknown as Partial<MedicalHistory>) };
    }
    return DEFAULT_MEDICAL_HISTORY;
  }, [patient]);

  const activeConditions: string[] = useMemo(() => {
    const conditions: string[] = [];
    if (patientMedicalHistory.diabetes) conditions.push("Diabetes");
    if (patientMedicalHistory.hypertension) conditions.push("Hypertension");
    if (patientMedicalHistory.thyroid) conditions.push("Thyroid");
    if (patientMedicalHistory.asthma) conditions.push("Asthma");
    if (patientMedicalHistory.tuberculosis) conditions.push("Tuberculosis");
    if (patientMedicalHistory.cardiac) conditions.push("Cardiac");
    if (patientMedicalHistory.arthritis) conditions.push("Arthritis");
    if (patientMedicalHistory.other) {
      const otherText = patientMedicalHistory.other_text?.trim();
      if (otherText) conditions.push(otherText);
      else conditions.push("Other");
    }
    return conditions;
  }, [patientMedicalHistory]);

  const existingVisitTreatmentName = useMemo(() => {
    if (!existingVisit) return null;
    const found = treatmentTypes.find((t) => t.id === existingVisit.treatment_type_id);
    return found?.name || "Recorded Visit";
  }, [existingVisit, treatmentTypes]);

  // ---- Form state ----
  const [treatmentTypeId, setTreatmentTypeId] = useState("");
  const [visitDate, setVisitDate] = useState(todayIST());
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
  const [amount, setAmount] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [recallOverride, setRecallOverride] = useState("");
  const [recallTimeOverride, setRecallTimeOverride] = useState("");

  const [rxDraft, setRxDraft] = useState<PrescriptionDraft>(emptyPrescriptionDraft(""));

  const [clientRequestId] = useState(() => crypto.randomUUID());
  const [rxClientRequestId] = useState(() => crypto.randomUUID());

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedVisitId, setSavedVisitId] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  // The visit this consultation is currently acting on -- known upfront from the URL in
  // existing-visit mode, or set once createVisitWithRecall succeeds in new-visit mode. Used to
  // scope AddPaymentModal's "Record & Print" lookup to this visit's own prescription (if any),
  // rather than the patient's most recent prescription across all visits.
  const [currentVisitId, setCurrentVisitId] = useState<string | null>(visitId);

  // Prefill teeth from existing visit
  useEffect(() => {
    if (!existingVisit) return;
    let teeth: number[] = [];
    if (existingVisit.teeth && existingVisit.teeth.length > 0) {
      teeth = [...existingVisit.teeth];
    } else if (existingVisit.tooth_numbers) {
      teeth = existingVisit.tooth_numbers
        .split(",")
        .map((t) => parseInt(t.trim(), 10))
        .filter((n) => !isNaN(n));
    }
    setSelectedTeeth(Array.from(new Set(teeth)).sort((a, b) => a - b));
  }, [existingVisit]);

  useEffect(() => {
    if (profile?.full_name) {
      setRxDraft((prev) => (prev.doctor_name ? prev : { ...prev, doctor_name: profile.full_name || "" }));
    }
  }, [profile?.full_name]);

  useEffect(() => {
    if (treatmentTypes.length > 0 && !treatmentTypeId) {
      setTreatmentTypeId(treatmentTypes[0].id);
    }
  }, [treatmentTypes, treatmentTypeId]);

  const selectedTreatment = treatmentTypes.find((t) => t.id === treatmentTypeId);
  const recallDays = selectedTreatment?.recall_days ?? 0;

  useEffect(() => {
    if (isExistingVisitMode) return;
    if (!visitDate || !recallDays) {
      setRecallOverride("");
      setRecallTimeOverride("");
      return;
    }
    const dt = new Date(`${visitDate}T00:00:00+05:30`);
    dt.setDate(dt.getDate() + recallDays);
    setRecallOverride(dt.toISOString().split("T")[0]);
  }, [visitDate, recallDays, isExistingVisitMode]);

  const hasRxContent = canPrescribe && !isPrescriptionDraftEmpty(rxDraft);

  function patchRxDraft(partial: Partial<PrescriptionDraft>) {
    setRxDraft((prev) => ({ ...prev, ...partial }));
  }

  function patchInvestigation(partial: Partial<InvestigationState>) {
    setRxDraft((prev) => ({
      ...prev,
      investigation: { ...prev.investigation, ...partial },
    }));
  }

  function addMedicationRow() {
    setRxDraft((prev) => ({
      ...prev,
      medications: [...prev.medications, { name: "", dosage: "", duration: "", notes: "" }],
    }));
  }

  function removeMedicationRow(index: number) {
    setRxDraft((prev) => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index),
    }));
  }

  function updateMedicationRow(index: number, partial: Partial<MedicationRowState>) {
    setRxDraft((prev) => ({
      ...prev,
      medications: prev.medications.map((m, i) => (i === index ? { ...m, ...partial } : m)),
    }));
  }

  function selectMedicineForRow(index: number, medicine: MedicineRow) {
    updateMedicationRow(index, {
      name: medicine.name,
      dosage: medicine.default_dosage ?? "",
      duration: medicine.default_duration ?? "",
      notes: medicine.notes ?? "",
    });
  }

  async function attemptPrescriptionSave(forVisitId: string): Promise<{ ok: boolean; prescriptionId: string | null }> {
    // Existing-visit mode: the ToothChart above is the ONLY editable teeth control for this
    // visit too (Phase 15A) -- if the doctor changed it from what's already on the visit, sync
    // visits.teeth (and its tooth_numbers text mirror) to match before writing the prescription,
    // so the two columns can never end up disagreeing. Guarded on an actual change so a save that
    // didn't touch teeth doesn't bump visits.updated_at / spam the audit log for nothing. Normal
    // (new-visit) mode never reaches here with existingVisit set -- visits.teeth was already
    // written from this same selectedTeeth array moments ago by createVisitWithRecall.
    if (isExistingVisitMode && existingVisit) {
      const currentVisitTeeth = [...(existingVisit.teeth ?? [])].sort((a, b) => a - b);
      const editedTeeth = [...selectedTeeth].sort((a, b) => a - b);
      const teethChanged =
        currentVisitTeeth.length !== editedTeeth.length ||
        currentVisitTeeth.some((t, i) => t !== editedTeeth[i]);

      if (teethChanged) {
        const { error: visitTeethError } = await supabase
          .from("visits")
          .update({
            teeth: editedTeeth.length > 0 ? editedTeeth : null,
            tooth_numbers: editedTeeth.length > 0 ? editedTeeth.join(", ") : null,
          })
          .eq("id", forVisitId);
        if (visitTeethError) {
          setErrorMsg(`Could not update the visit's teeth: ${visitTeethError.message}`);
          setSubmitting(false);
          return { ok: false, prescriptionId: null };
        }
        setExistingVisit((prev) => (prev ? { ...prev, teeth: editedTeeth.length > 0 ? editedTeeth : null } : prev));
      }
    }

    const rxRes = await createPrescription({
      clinic_id: profile!.clinic_id!,
      branch_id: patient!.branch_id,
      patient_id: patient!.id,
      visit_id: forVisitId,
      doctor_name: rxDraft.doctor_name.trim(),
      prescribed_on: isExistingVisitMode ? todayIST() : visitDate,
      occupation: null,
      height: null,
      medical_history: null,
      weight: rxDraft.weight.trim() || null,
      blood_pressure: rxDraft.blood_pressure.trim() || null,
      spo2: rxDraft.spo2.trim() || null,
      chief_complaint: rxDraft.chief_complaint.trim() || null,
      past_dental_history: rxDraft.past_dental_history.trim() || null,
      oral_examination: rxDraft.oral_examination.trim() || null,
      investigation: draftToInvestigationJson(rxDraft.investigation),
      provisional_diagnosis: rxDraft.provisional_diagnosis.trim() || null,
      treatment_plan: rxDraft.treatment_plan.trim() || null,
      teeth: selectedTeeth.length > 0 ? selectedTeeth : null,
      medications: draftToMedications(rxDraft.medications),
      notes: rxDraft.notes.trim() || null,
      client_request_id: rxClientRequestId,
    });

    if (rxRes.ok === false) {
      if (!isExistingVisitMode) setSavedVisitId(forVisitId);
      setErrorMsg(
        isExistingVisitMode
          ? `The prescription could not be saved: ${rxRes.error}`
          : `The visit was saved, but the prescription could not be saved: ${rxRes.error}. Nothing else was changed -- submit again to retry just the prescription.`,
      );
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }

    toastSuccess("Prescription saved successfully.");
    setSubmitting(false);
    return { ok: true, prescriptionId: rxRes.data.id };
  }

  async function performSave(): Promise<{ ok: boolean; prescriptionId: string | null }> {
    setErrorMsg(null);
    setSubmitting(true);

    if (!patient) {
      setErrorMsg("Patient not loaded yet.");
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }

    if (isExistingVisitMode) {
      if (!canPrescribe) {
        setErrorMsg("Only a doctor can add a prescription to this visit.");
        setSubmitting(false);
        return { ok: false, prescriptionId: null };
      }
      if (!hasRxContent) {
        setErrorMsg("Enter the prescription details to save.");
        setSubmitting(false);
        return { ok: false, prescriptionId: null };
      }
      if (!rxDraft.doctor_name.trim()) {
        setErrorMsg("Enter the doctor's name for the prescription.");
        setSubmitting(false);
        return { ok: false, prescriptionId: null };
      }
      return attemptPrescriptionSave(visitId!);
    }

    // New-visit mode
    if (savedVisitId) {
      return attemptPrescriptionSave(savedVisitId);
    }

    if (!treatmentTypeId) {
      setErrorMsg("Please select a treatment type.");
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }
    if (!amount.trim()) {
      setErrorMsg("Enter an amount. Use 0 if this visit is free.");
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setErrorMsg("Amount cannot be negative.");
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }
    let parsedDiscount = 0;
    if (discountPercent.trim()) {
      parsedDiscount = parseFloat(discountPercent);
      if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
        setErrorMsg("Discount % must be between 0 and 100.");
        setSubmitting(false);
        return { ok: false, prescriptionId: null };
      }
    }
    if (hasRxContent && !rxDraft.doctor_name.trim()) {
      setErrorMsg("Enter the doctor's name for the prescription.");
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }

    const visitRes = await createVisitWithRecall({
      patient_id: patient.id,
      treatment_type_id: treatmentTypeId,
      visit_date: visitDate,
      tooth_numbers: selectedTeeth.length > 0 ? selectedTeeth.slice().sort((a, b) => a - b).join(", ") : null,
      teeth: selectedTeeth.length > 0 ? selectedTeeth : null,
      notes: visitNotes.trim() || null,
      amount: parsedAmount,
      discount_percent: parsedDiscount,
      recall_date_override: recallOverride || null,
      recall_due_time: recallOverride && recallTimeOverride ? recallTimeOverride.trim() : null,
      client_request_id: clientRequestId,
    });

    if (visitRes.ok === false) {
      if (isAlreadySavedError(visitRes.error)) {
        if (hasRxContent) {
          setErrorMsg(
            "The visit was already saved, but the prescription could not be linked automatically. Please refresh and re-enter it.",
          );
          setSubmitting(false);
          return { ok: false, prescriptionId: null };
        }
        toastSuccess("Visit and recall recorded successfully.");
        setSubmitting(false);
        return { ok: true, prescriptionId: null };
      }
      setErrorMsg(visitRes.error);
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }

    const newVisitId = visitRes.data.visit_id;
    setCurrentVisitId(newVisitId);

    if (!hasRxContent) {
      toastSuccess("Visit and recall recorded successfully.");
      setSubmitting(false);
      return { ok: true, prescriptionId: null };
    }

    return attemptPrescriptionSave(newVisitId);
  }

  // Single exit point for leaving this consultation. When opened from the in-clinic queue
  // (appointmentId present), marks that appointment "done" first -- this is the only place the
  // appointment transitions out of "in_chair", so every way of leaving (Save, Save & Print,
  // Save & Payment, Back, Cancel) picks it up automatically without duplicating the call.
  async function goToPatientProfile() {
    if (appointmentId) {
      const res = await updateAppointmentStatus(appointmentId, "done");
      if (!res.ok) {
        toast({
          description: `The visit was saved, but the appointment could not be marked done: ${res.error}`,
          type: "info",
        });
      }
    }
    if (patient) {
      navigate(`/app/patients?id=${patient.id}`);
    } else {
      navigate("/app/patients");
    }
  }

  async function handleSave() {
    const result = await performSave();
    if (result.ok) goToPatientProfile();
  }

  async function handleSaveAndPrint() {
    const win = window.open("", "_blank");
    const result = await performSave();
    if (!result.ok || !result.prescriptionId) {
      win?.close();
      if (result.ok) goToPatientProfile();
      return;
    }
    if (win) {
      win.location.href = `/app/prescriptions/${result.prescriptionId}/print?print=1`;
    }
    goToPatientProfile();
  }

  async function handleSaveAndPayment() {
    const result = await performSave();
    if (result.ok) setPaymentModalOpen(true);
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Loading consultation...</span>
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-80 shrink-0 space-y-4">
            <Card className="p-4 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </Card>
            <Card className="p-4 space-y-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-16 w-full" />
            </Card>
          </div>
          <div className="flex-1 space-y-4">
            <Card className="p-4 space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-10 w-full" />
            </Card>
            <Card className="p-4 space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-10 w-full" />
            </Card>
            <Card className="p-4 space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-24 w-full" />
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !patient) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive space-y-3 max-w-lg mx-auto text-center mt-8">
        <div className="flex items-center justify-center gap-2 font-medium">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{loadError ?? "Patient not found or not accessible."}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/app/patients")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Patients
        </Button>
      </div>
    );
  }

  const saveLabel = isExistingVisitMode ? "Save Prescription" : savedVisitId ? "Retry Prescription" : "Save";

  // Calculations for billing preview
  const parsedAmt = parseFloat(amount) || 0;
  const parsedDisc = parseFloat(discountPercent) || 0;
  const netAmt = parsedDisc > 0 ? Math.round(parsedAmt * (1 - parsedDisc / 100)) : parsedAmt;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-20 sm:pb-24">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPatientProfile}
            title="Back to Patient Record"
            className="h-9 w-9 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground tracking-tight">Clinical Consultation</h1>
              <Badge variant="outline" className="text-xs font-normal">
                {isExistingVisitMode ? "Add Prescription" : "New Visit & Prescription"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Comprehensive patient evaluation, diagnosis, charting, and digital prescription
            </p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* TWO-COLUMN LAYOUT */}
      <div className="flex flex-col lg:flex-row items-start gap-6">
        {/* LEFT COLUMN (~25-28% width, sticky) */}
        <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-4 self-start space-y-4">
          {/* Patient Profile & Clinical Context Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Patient Context
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5 text-xs">
              <div>
                <span className="text-[11px] text-muted-foreground block">Patient Name</span>
                <span className="text-sm font-semibold text-foreground">{patient.name}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-muted-foreground block">Age / Gender</span>
                  <span className="font-medium text-foreground capitalize">
                    {patient.age ? `${patient.age} yrs` : "—"} / {patient.gender || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block">Mobile</span>
                  <span className="font-medium text-foreground">{patient.mobile}</span>
                </div>
              </div>

              {(patient.occupation || patient.height) && (
                <div className="grid grid-cols-2 gap-2">
                  {patient.occupation && (
                    <div>
                      <span className="text-[11px] text-muted-foreground block">Occupation</span>
                      <span className="text-foreground font-medium">{patient.occupation}</span>
                    </div>
                  )}
                  {patient.height && (
                    <div>
                      <span className="text-[11px] text-muted-foreground block">Height</span>
                      <span className="text-foreground font-medium">{patient.height}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Prominent Red Allergy Banner */}
              {patientMedicalHistory.allergies && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-600 text-white dark:bg-red-950/90 dark:border dark:border-red-600 dark:text-red-200 text-xs font-semibold tracking-wide shadow-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-white dark:text-red-400" />
                  <span>
                    {patientMedicalHistory.allergies_detail && patientMedicalHistory.allergies_detail.trim()
                      ? `Allergy: ${patientMedicalHistory.allergies_detail.trim()}`
                      : "Allergy noted (no details recorded)"}
                  </span>
                </div>
              )}

              {/* Medical History Condition Tags */}
              {activeConditions.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] text-muted-foreground block font-medium">Medical History</span>
                  <div className="flex flex-wrap gap-1">
                    {activeConditions.map((cond, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="text-[11px] font-normal py-0 px-2 border-primary/30 text-primary bg-primary/5"
                      >
                        {cond}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Existing Visit Context (when in ?visitId= mode) */}
          {isExistingVisitMode && existingVisit && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  Attached Visit Info
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium text-foreground font-mono">{formatDateIST(existingVisit.visit_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Treatment:</span>
                  <span className="font-medium text-foreground">{existingVisitTreatmentName}</span>
                </div>
                {existingVisit.amount !== null && existingVisit.amount !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="font-medium text-foreground font-mono">{formatINR(existingVisit.net_amount ?? existingVisit.amount)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Previous Prescription Summary Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                Previous Prescription
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {latestPrescription ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border pb-1">
                    <span className="font-mono">{formatDateIST(latestPrescription.prescribed_on)}</span>
                    <span>Dr. {latestPrescription.doctor_name}</span>
                  </div>

                  {latestPrescription.provisional_diagnosis && (
                    <div>
                      <span className="text-[11px] text-muted-foreground block">Diagnosis:</span>
                      <span className="font-medium text-foreground">{latestPrescription.provisional_diagnosis}</span>
                    </div>
                  )}

                  <div>
                    <span className="text-[11px] text-muted-foreground block mb-1">Medications:</span>
                    {Array.isArray(latestPrescription.medications) && latestPrescription.medications.length > 0 ? (
                      <ul className="space-y-1 text-[11px]">
                        {(latestPrescription.medications as unknown as PrescriptionMedication[]).map((med, idx) => (
                          <li key={idx} className="flex items-baseline justify-between gap-1">
                            <span className="font-medium text-foreground">• {med.name}</span>
                            <span className="text-muted-foreground">{[med.dosage, med.duration].filter(Boolean).join(" · ")}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">No medicines recorded</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-[11px] py-1 text-center">
                  No previous prescription
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN (~72-75% width): Collapsible Accordion Sections */}
        <div className="flex-1 w-full space-y-4">
          {savedVisitId && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
              <ClipboardPlus className="h-4 w-4 shrink-0 text-primary" />
              <span>The visit is saved. Only the prescription below still needs to be submitted.</span>
            </div>
          )}

          {/* SECTION 1: Today's Status */}
          <Card id="section-today_status" className="transition-all duration-200 scroll-mt-6">
            <CardHeader
              className="flex flex-row items-center justify-between cursor-pointer select-none py-3.5 px-5 hover:bg-muted/30 transition-colors rounded-t-lg"
              onClick={() => toggleSection("today_status")}
            >
              <div className="flex items-center gap-2.5">
                <HeartPulse className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">1. Today's Status</CardTitle>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  (Weight, BP, SpO2, Chief Complaint)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {rxDraft.chief_complaint && (
                  <Badge variant="outline" className="text-[11px] font-normal hidden md:inline">
                    Complaint noted
                  </Badge>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      openSection === "today_status" && "rotate-180",
                    )}
                  />
                </Button>
              </div>
            </CardHeader>
            {openSection === "today_status" && (
              <CardContent className="pt-4 px-5 border-t border-border space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="c-weight">Weight</Label>
                    <Input
                      id="c-weight"
                      placeholder="e.g. 68 kg"
                      value={rxDraft.weight}
                      onChange={(e) => patchRxDraft({ weight: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="c-bp">Blood Pressure</Label>
                    <Input
                      id="c-bp"
                      placeholder="e.g. 120/80 mmHg"
                      value={rxDraft.blood_pressure}
                      onChange={(e) => patchRxDraft({ blood_pressure: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="c-spo2">SpO2</Label>
                    <Input
                      id="c-spo2"
                      placeholder="e.g. 98%"
                      value={rxDraft.spo2}
                      onChange={(e) => patchRxDraft({ spo2: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="c-chief-complaint">Chief Complaint</Label>
                  <textarea
                    id="c-chief-complaint"
                    rows={2}
                    className={textareaClass}
                    placeholder="Patient's primary concern or symptoms (e.g. Sharp pain in lower right tooth since 3 days)"
                    value={rxDraft.chief_complaint}
                    onChange={(e) => patchRxDraft({ chief_complaint: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="c-past-dental">Past Dental History</Label>
                  <textarea
                    id="c-past-dental"
                    rows={2}
                    className={textareaClass}
                    placeholder="Prior dental treatments, restorations, extractions, or complications"
                    value={rxDraft.past_dental_history}
                    onChange={(e) => patchRxDraft({ past_dental_history: e.target.value })}
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-border/40">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToSection("examination")}
                    className="gap-1 text-xs hover:bg-primary/5 hover:text-primary hover:border-primary/40"
                  >
                    Next <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          {/* SECTION 2: Examination */}
          <Card id="section-examination" className="transition-all duration-200 scroll-mt-6">
            <CardHeader
              className="flex flex-row items-center justify-between cursor-pointer select-none py-3.5 px-5 hover:bg-muted/30 transition-colors rounded-t-lg"
              onClick={() => toggleSection("examination")}
            >
              <div className="flex items-center gap-2.5">
                <Stethoscope className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">2. Examination</CardTitle>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  (Oral Exam, Investigations, Provisional Diagnosis)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {rxDraft.provisional_diagnosis && (
                  <Badge variant="outline" className="text-[11px] font-normal hidden md:inline">
                    {rxDraft.provisional_diagnosis}
                  </Badge>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      openSection === "examination" && "rotate-180",
                    )}
                  />
                </Button>
              </div>
            </CardHeader>
            {openSection === "examination" && (
              <CardContent className="pt-4 px-5 border-t border-border space-y-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="c-oral-exam">Oral Examination</Label>
                  <textarea
                    id="c-oral-exam"
                    rows={2}
                    className={textareaClass}
                    placeholder="Clinical findings (e.g. Deep occlusal caries irt 46, tender to vertical percussion)"
                    value={rxDraft.oral_examination}
                    onChange={(e) => patchRxDraft({ oral_examination: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-foreground">Investigation</Label>
                  <div className="flex flex-wrap gap-2">
                    <TogglePill
                      active={rxDraft.investigation.iopa}
                      label="IOPA"
                      onClick={() => patchInvestigation({ iopa: !rxDraft.investigation.iopa })}
                    />
                    <TogglePill
                      active={rxDraft.investigation.rvg}
                      label="RVG"
                      onClick={() => patchInvestigation({ rvg: !rxDraft.investigation.rvg })}
                    />
                    <TogglePill
                      active={rxDraft.investigation.opg}
                      label="OPG"
                      onClick={() => patchInvestigation({ opg: !rxDraft.investigation.opg })}
                    />
                    <TogglePill
                      active={rxDraft.investigation.blood_other}
                      label="Blood / Other"
                      onClick={() => patchInvestigation({ blood_other: !rxDraft.investigation.blood_other })}
                    />
                  </div>
                  <Input
                    placeholder="Investigation notes (e.g. Radiolucency involving pulp irt 46, periapical widening)"
                    value={rxDraft.investigation.notes}
                    onChange={(e) => patchInvestigation({ notes: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="c-diagnosis">Provisional Diagnosis</Label>
                  <Input
                    id="c-diagnosis"
                    placeholder="e.g. Acute apical periodontitis irt 46"
                    value={rxDraft.provisional_diagnosis}
                    onChange={(e) => patchRxDraft({ provisional_diagnosis: e.target.value })}
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-border/40">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToSection("treatment")}
                    className="gap-1 text-xs hover:bg-primary/5 hover:text-primary hover:border-primary/40"
                  >
                    Next <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          {/* SECTION 3: Treatment */}
          <Card id="section-treatment" className="transition-all duration-200 scroll-mt-6">
            <CardHeader
              className="flex flex-row items-center justify-between cursor-pointer select-none py-3.5 px-5 hover:bg-muted/30 transition-colors rounded-t-lg"
              onClick={() => toggleSection("treatment")}
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">3. Treatment</CardTitle>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  (Treatment Type, Tooth Chart, Treatment Plan)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedTeeth.length > 0 && (
                  <Badge variant="outline" className="text-[11px] font-normal hidden md:inline">
                    {selectedTeeth.length} {selectedTeeth.length === 1 ? "tooth" : "teeth"} selected
                  </Badge>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      openSection === "treatment" && "rotate-180",
                    )}
                  />
                </Button>
              </div>
            </CardHeader>
            {openSection === "treatment" && (
              <CardContent className="pt-4 px-5 border-t border-border space-y-4">
                {!isExistingVisitMode && (
                  <fieldset disabled={Boolean(savedVisitId)} className="space-y-4 disabled:opacity-50">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="c-tt">Treatment Type *</Label>
                        <select
                          id="c-tt"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          value={treatmentTypeId}
                          onChange={(e) => setTreatmentTypeId(e.target.value)}
                        >
                          {treatmentTypes.map((tt) => (
                            <option key={tt.id} value={tt.id}>
                              {tt.name} ({tt.recall_days}d recall)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="c-date">Visit Date *</Label>
                        <Input id="c-date" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Label htmlFor="c-recall" className="text-xs shrink-0 font-medium">
                        Next Recall Date{recallDays ? ` (${recallDays}d default)` : ""}:
                      </Label>
                      <Input
                        id="c-recall"
                        type="date"
                        value={recallOverride}
                        onChange={(e) => {
                          setRecallOverride(e.target.value);
                          if (!e.target.value) setRecallTimeOverride("");
                        }}
                        className="h-8 w-36 text-xs"
                      />
                      <div className="flex items-center gap-1">
                        <Input
                          id="c-recall-time"
                          type="time"
                          aria-label="Recall Due Time (optional)"
                          title="Optional reminder time. When set, sends reminder 2 hours before."
                          value={recallTimeOverride}
                          onChange={(e) => setRecallTimeOverride(e.target.value)}
                          disabled={!recallOverride}
                          className="h-8 w-28 text-xs disabled:opacity-50"
                        />
                        {recallTimeOverride && (
                          <button
                            type="button"
                            title="Clear reminder time"
                            onClick={() => setRecallTimeOverride("")}
                            className="text-xs text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="c-notes">Clinical / Visit Notes</Label>
                      <Input
                        id="c-notes"
                        placeholder="e.g. Scaling done, advised warm saline rinse"
                        value={visitNotes}
                        onChange={(e) => setVisitNotes(e.target.value)}
                      />
                    </div>
                  </fieldset>
                )}

                {/* Tooth Chart */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <Label className="text-xs font-medium text-foreground">Interactive Dental Chart (Teeth Selection)</Label>
                  <ToothChart
                    value={selectedTeeth}
                    onChange={setSelectedTeeth}
                    dentitionType={(patient?.dentition_type as "adult" | "child") ?? "adult"}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="c-treatment-plan">Treatment Plan</Label>
                  <textarea
                    id="c-treatment-plan"
                    rows={2}
                    className={textareaClass}
                    placeholder="Proposed treatment course (e.g. Root Canal Treatment irt 46 followed by PFM Crown)"
                    value={rxDraft.treatment_plan}
                    onChange={(e) => patchRxDraft({ treatment_plan: e.target.value })}
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-border/40">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToSection("rx")}
                    className="gap-1 text-xs hover:bg-primary/5 hover:text-primary hover:border-primary/40"
                  >
                    Next <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          {/* SECTION 4: Rx (Medicines) */}
          <Card id="section-rx" className="transition-all duration-200 scroll-mt-6">
            <CardHeader
              className="flex flex-row items-center justify-between cursor-pointer select-none py-3.5 px-5 hover:bg-muted/30 transition-colors rounded-t-lg"
              onClick={() => toggleSection("rx")}
            >
              <div className="flex items-center gap-2.5">
                <Pill className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">4. Rx (Medicines)</CardTitle>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  (Prescription, Dosage, Duration, Doctor Name)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {rxDraft.medications.filter((m) => m.name.trim()).length > 0 && (
                  <Badge variant="outline" className="text-[11px] font-normal hidden md:inline">
                    {rxDraft.medications.filter((m) => m.name.trim()).length} medicines added
                  </Badge>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      openSection === "rx" && "rotate-180",
                    )}
                  />
                </Button>
              </div>
            </CardHeader>
            {openSection === "rx" && (
              <CardContent className="pt-4 px-5 border-t border-border space-y-4">
                {canPrescribe ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs font-medium text-foreground">Medications List</Label>
                      {rxDraft.medications.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 italic">
                          No medications added yet. Click below to add medicines to this prescription.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {rxDraft.medications.map((m, i) => (
                            <MedicationRowEditor
                              key={i}
                              index={i}
                              row={m}
                              allMedications={rxDraft.medications}
                              medicines={medicines}
                              onChange={(partial) => updateMedicationRow(i, partial)}
                              onSelectMedicine={(medicine) => selectMedicineForRow(i, medicine)}
                              onRemove={() => removeMedicationRow(i)}
                            />
                          ))}
                        </div>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={addMedicationRow} className="self-start mt-1">
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add Medicine
                      </Button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 pt-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="rx-doctor-name">Doctor Name *</Label>
                        <Input
                          id="rx-doctor-name"
                          value={rxDraft.doctor_name}
                          onChange={(e) => patchRxDraft({ doctor_name: e.target.value })}
                          placeholder="Prescribing dentist name"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="rx-notes">Prescription Notes / Advice</Label>
                        <Input
                          id="rx-notes"
                          value={rxDraft.notes}
                          onChange={(e) => patchRxDraft({ notes: e.target.value })}
                          placeholder="General instructions or precautions for patient"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    Only a doctor can prescribe medications for this patient.
                  </p>
                )}

                {!isExistingVisitMode && (
                  <div className="flex justify-end pt-2 border-t border-border/40">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => goToSection("billing")}
                      className="gap-1 text-xs hover:bg-primary/5 hover:text-primary hover:border-primary/40"
                    >
                      Next <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* SECTION 5: Billing (Hidden in existing-visit mode) */}
          {!isExistingVisitMode && (
            <Card id="section-billing" className="transition-all duration-200 scroll-mt-6">
              <CardHeader
                className="flex flex-row items-center justify-between cursor-pointer select-none py-3.5 px-5 hover:bg-muted/30 transition-colors rounded-t-lg"
                onClick={() => toggleSection("billing")}
              >
                <div className="flex items-center gap-2.5">
                  <IndianRupee className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">5. Billing</CardTitle>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    (Amount Charged & Discount)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {parsedAmt > 0 && (
                    <Badge variant="outline" className="text-[11px] font-normal hidden md:inline font-mono">
                      Net: {formatINR(netAmt)}
                    </Badge>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        openSection === "billing" && "rotate-180",
                      )}
                    />
                  </Button>
                </div>
              </CardHeader>
              {openSection === "billing" && (
                <CardContent className="pt-4 px-5 border-t border-border space-y-4">
                  <fieldset disabled={Boolean(savedVisitId)} className="space-y-4 disabled:opacity-50">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="c-amt">Amount Charged (₹) *</Label>
                        <Input
                          id="c-amt"
                          type="number"
                          min="0"
                          step="any"
                          placeholder="e.g. 5000 (or 0 if free)"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="c-disc">Discount %</Label>
                        <Input
                          id="c-disc"
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          placeholder="0"
                          value={discountPercent}
                          onChange={(e) => setDiscountPercent(e.target.value)}
                        />
                      </div>
                    </div>

                    {parsedAmt > 0 && (
                      <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Calculated Net Payable:</span>
                        <div className="flex items-center gap-2">
                          {parsedDisc > 0 && (
                            <span className="line-through text-muted-foreground font-mono">
                              {formatINR(parsedAmt)}
                            </span>
                          )}
                          <span className="font-semibold text-foreground text-sm font-mono">
                            {formatINR(netAmt)}
                          </span>
                        </div>
                      </div>
                    )}
                  </fieldset>
                </CardContent>
              )}
            </Card>
          )}
          </div>
        </div>

      {/* FIXED BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-card/95 backdrop-blur border-t border-border py-2.5 px-4 sm:px-6 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={goToPatientProfile} disabled={submitting}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {canPrescribe && (
              <Button type="button" variant="outline" size="sm" onClick={handleSaveAndPrint} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Printer className="h-4 w-4 mr-1.5" />}
                Save & Print
              </Button>
            )}
            {!isExistingVisitMode && (
              <Button type="button" variant="outline" size="sm" onClick={handleSaveAndPayment} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CreditCard className="h-4 w-4 mr-1.5" />}
                Save & Payment
              </Button>
            )}
            <Button type="button" size="sm" onClick={handleSave} disabled={submitting} className="shadow-sm">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {saveLabel}
            </Button>
          </div>
        </div>
      </div>

      {/* Add Payment Modal integration */}
      <AddPaymentModal
        open={paymentModalOpen}
        onOpenChange={(open) => {
          setPaymentModalOpen(open);
          if (!open) goToPatientProfile();
        }}
        patientId={patient.id}
        patientName={patient.name}
        clinicId={patient.clinic_id}
        branchId={patient.branch_id}
        visitId={currentVisitId ?? undefined}
        onSuccess={goToPatientProfile}
      />
    </div>
  );
}
