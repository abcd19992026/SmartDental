import { useEffect, useState, type FormEvent } from "react";
import { Search, Stethoscope, AlertCircle, Loader2, ChevronDown, ChevronUp, ClipboardPlus, Printer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { createVisitWithRecall, createPrescription, isAlreadySavedError } from "@/lib/clinic-api";
import { todayIST, formatDateIST } from "@/lib/dates";
import { formatINR } from "@/lib/utils";
import { ToothChart } from "@/features/clinic/dental-chart/ToothChart";
import {
  PrescriptionSection,
  emptyPrescriptionDraft,
  isPrescriptionDraftEmpty,
  draftToMedicalHistoryJson,
  draftToInvestigationJson,
  draftToMedications,
  type PrescriptionDraft,
} from "@/features/clinic/PrescriptionSection";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PatientSearchSelect } from "@/components/clinic/PatientSearchSelect";

type TreatmentTypeRow = Database["public"]["Tables"]["treatment_types"]["Row"];
type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type BranchRow = Database["public"]["Tables"]["branches"]["Row"];

interface AddVisitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPatientId?: string;
  onSuccess?: () => void;
}

export function AddVisitModal({ open, onOpenChange, initialPatientId, onSuccess }: AddVisitModalProps) {
  const { profile } = useAuth();
  const { success: toastSuccess } = useToast();

  // Diagnosing/prescribing is the dentist's job, not the front desk's -- RLS already blocks the
  // write (prescriptions_insert is owner/super_admin only, see 9A), this is about not showing a
  // receptionist a diagnosis form at all, absent rather than disabled.
  const canPrescribe = profile?.role === "owner" || profile?.role === "super_admin";

  const [treatmentTypes, setTreatmentTypes] = useState<TreatmentTypeRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);

  // Form Fields
  const [patientId, setPatientId] = useState<string>(initialPatientId || "");
  const [isInlinePatient, setIsInlinePatient] = useState(false);

  // Inline Patient Fields
  const [inlineName, setInlineName] = useState("");
  const [inlineMobile, setInlineMobile] = useState("");
  const [inlineBranchId, setInlineBranchId] = useState("");

  const [treatmentTypeId, setTreatmentTypeId] = useState("");
  const [visitDate, setVisitDate] = useState(todayIST());
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
  const [amount, setAmount] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [notes, setNotes] = useState("");
  const [recallOverride, setRecallOverride] = useState("");

  // Prescription section -- collapsed until explicitly opened. Never rendered at all for a
  // receptionist (canPrescribe above), so showRx can only ever go true for an owner/super_admin.
  const [showRx, setShowRx] = useState(false);
  const [rxDraft, setRxDraft] = useState<PrescriptionDraft>(emptyPrescriptionDraft(""));
  // Held separately from the visit's own id -- a retry of just the prescription (see below) must
  // still collide on a re-retry, so it's generated once per form opening, same as the visit's.
  const [rxClientRequestId, setRxClientRequestId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Generated once per form opening, held for the lifetime of this form instance, sent
  // unchanged on every submit attempt -- a retry after a slow/failed response must collide with
  // the same value, not generate a fresh one, or double-submit protection does nothing.
  const [clientRequestId, setClientRequestId] = useState("");

  // Set once the visit half of a merged save succeeds but the prescription half fails. The visit
  // is real and billing is correct at that point -- never re-attempted, never rolled back. While
  // this is set, submitting the form again only retries the prescription, reusing the same
  // visit_id and the same rxClientRequestId (so a retry-of-a-retry still collides safely).
  const [savedVisitId, setSavedVisitId] = useState<string | null>(null);
  const [savedPatientId, setSavedPatientId] = useState<string | null>(null);
  const [savedBranchId, setSavedBranchId] = useState<string | null>(null);

  useEffect(() => {
    if (initialPatientId) {
      setPatientId(initialPatientId);
    }
  }, [initialPatientId]);

  useEffect(() => {
    if (!open) return;
    loadRefData();
    setDiscountPercent("");
    setSelectedTeeth([]);
    setClientRequestId(crypto.randomUUID());
    setRxClientRequestId(crypto.randomUUID());
    setShowRx(false);
    setRxDraft(emptyPrescriptionDraft(profile?.full_name || ""));
    setSavedVisitId(null);
    setSavedPatientId(null);
    setSavedBranchId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function loadRefData() {
    setErrorMsg(null);

    const [ttRes, pRes, bRes] = await Promise.all([
      supabase.from("treatment_types").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("patients").select("*").eq("is_active", true).order("name"),
      supabase.from("branches").select("*").eq("is_active", true),
    ]);

    if (ttRes.data) {
      setTreatmentTypes(ttRes.data);
      if (ttRes.data.length > 0 && !treatmentTypeId) {
        setTreatmentTypeId(ttRes.data[0].id);
      }
    }
    if (pRes.data) setPatients(pRes.data);
    if (bRes.data) {
      setBranches(bRes.data);
      if (bRes.data.length > 0) {
        setInlineBranchId(profile?.branch_id || bRes.data[0].id);
      }
    }
  }

  // Live computed recall date
  const selectedTreatment = treatmentTypes.find((t) => t.id === treatmentTypeId);
  const recallDays = selectedTreatment?.recall_days ?? 0;

  useEffect(() => {
    if (!visitDate || !recallDays) {
      setRecallOverride("");
      return;
    }
    const dt = new Date(`${visitDate}T00:00:00+05:30`);
    dt.setDate(dt.getDate() + recallDays);
    const computedStr = dt.toISOString().split("T")[0];
    setRecallOverride(computedStr);
  }, [visitDate, recallDays]);

  const hasRxContent = canPrescribe && showRx && !isPrescriptionDraftEmpty(rxDraft);

  /** Attempts the prescription write for an already-saved visit. Shared by the main submit path
   * (visit just created) and the "retry just the prescription" path (savedVisitId already set
   * from a previous failed attempt). Never touches the visit -- it already exists. Returns the
   * saved/reused prescription's id so Save & Print can navigate the pre-opened tab to it --
   * createPrescription() (clinic-api.ts) already resolves a client_request_id collision to the
   * original row's id rather than swallowing it, so this never has to re-fetch it itself. */
  async function attemptPrescriptionSave(
    visitId: string,
    forPatientId: string,
    forBranchId: string,
  ): Promise<{ ok: boolean; prescriptionId: string | null }> {
    const rxRes = await createPrescription({
      clinic_id: profile!.clinic_id!,
      branch_id: forBranchId,
      patient_id: forPatientId,
      visit_id: visitId,
      doctor_name: rxDraft.doctor_name.trim(),
      prescribed_on: visitDate,
      occupation: rxDraft.occupation.trim() || null,
      height: rxDraft.height.trim() || null,
      weight: rxDraft.weight.trim() || null,
      blood_pressure: rxDraft.blood_pressure.trim() || null,
      spo2: rxDraft.spo2.trim() || null,
      chief_complaint: rxDraft.chief_complaint.trim() || null,
      medical_history: draftToMedicalHistoryJson(rxDraft.medical_history),
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
      // The visit is already saved and billing is correct -- never rolled back. Tell the dentist
      // plainly that the prescription did not save, and leave the form in retry mode.
      // (createPrescription() already resolves a client_request_id collision to a success with
      // the original row, so reaching here means a genuine, non-idempotent failure -- the old
      // isAlreadySavedError escape hatch is no longer reachable and has been dropped.)
      setSavedVisitId(visitId);
      setSavedPatientId(forPatientId);
      setSavedBranchId(forBranchId);
      setErrorMsg(
        `The visit was saved, but the prescription could not be saved: ${rxRes.error}. Nothing else was changed -- resubmit to retry just the prescription.`,
      );
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }

    toastSuccess("Visit and prescription recorded successfully.");
    setSubmitting(false);
    onOpenChange(false);
    if (onSuccess) onSuccess();
    return { ok: true, prescriptionId: rxRes.data.id };
  }

  /** The full save flow (patient/visit/prescription), shared by the plain Save button and Save &
   * Print -- the only difference between the two is what happens with the returned
   * prescriptionId after this resolves (nothing, vs. navigating a pre-opened tab to its print
   * page). Every UI side effect that already happens on success today (toast, closing the
   * dialog, onSuccess) stays exactly as before; this just also hands the caller the id. */
  async function performSave(): Promise<{ ok: boolean; prescriptionId: string | null }> {
    setErrorMsg(null);
    setSubmitting(true);

    // Retry-prescription-only path: the visit from an earlier attempt already exists.
    if (savedVisitId && savedPatientId && savedBranchId) {
      return attemptPrescriptionSave(savedVisitId, savedPatientId, savedBranchId);
    }

    let activePatientId = patientId;
    let activeBranchId: string | null = null;

    // 1. Create Inline Patient if toggled
    if (isInlinePatient) {
      if (!inlineName.trim()) {
        setErrorMsg("Please enter patient name.");
        setSubmitting(false);
        return { ok: false, prescriptionId: null };
      }
      if (!/^\d{10}$/.test(inlineMobile.trim())) {
        setErrorMsg("Mobile number must be exactly 10 digits.");
        setSubmitting(false);
        return { ok: false, prescriptionId: null };
      }
      const targetBranchId = profile?.role === "receptionist" ? profile.branch_id : inlineBranchId;
      if (!targetBranchId) {
        setErrorMsg("Please select a branch for the new patient.");
        setSubmitting(false);
        return { ok: false, prescriptionId: null };
      }

      const { data: newP, error: pErr } = await supabase
        .from("patients")
        .insert({
          clinic_id: profile?.clinic_id!,
          branch_id: targetBranchId,
          name: inlineName.trim(),
          mobile: inlineMobile.trim(),
          is_active: true,
        })
        .select("id")
        .single();

      if (pErr) {
        if (pErr.code === "23505") {
          setErrorMsg("A patient with this mobile number already exists.");
        } else {
          setErrorMsg(pErr.message);
        }
        setSubmitting(false);
        return { ok: false, prescriptionId: null };
      }
      activePatientId = newP.id;
      activeBranchId = targetBranchId;
    } else {
      activeBranchId = patients.find((p) => p.id === activePatientId)?.branch_id ?? null;
    }

    if (!activePatientId) {
      setErrorMsg("Please select or create a patient.");
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }

    if (!treatmentTypeId) {
      setErrorMsg("Please select a treatment type.");
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }

    // Amount validation: required (accepts 0, rejects empty or negative)
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

    // Discount validation
    let parsedDiscount: number = 0;
    if (discountPercent.trim()) {
      parsedDiscount = parseFloat(discountPercent);
      if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
        setErrorMsg("Discount % must be between 0 and 100.");
        setSubmitting(false);
        return { ok: false, prescriptionId: null };
      }
    }

    // Validate the prescription's one required field up front, before creating the visit --
    // otherwise a missing doctor name would fail only after the visit already exists.
    if (hasRxContent && !rxDraft.doctor_name.trim()) {
      setErrorMsg("Enter the doctor's name for the prescription.");
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }
    if (hasRxContent && !activeBranchId) {
      setErrorMsg("Could not determine the branch for this prescription.");
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }

    // 2. Create the visit first. If this fails outright, nothing else happens -- unchanged from
    // before the prescription section existed.
    const visitRes = await createVisitWithRecall({
      patient_id: activePatientId,
      treatment_type_id: treatmentTypeId,
      visit_date: visitDate,
      tooth_numbers: selectedTeeth.length > 0 ? selectedTeeth.slice().sort((a, b) => a - b).join(", ") : null,
      teeth: selectedTeeth.length > 0 ? selectedTeeth : null,
      notes: notes.trim() || null,
      amount: parsedAmount,
      discount_percent: parsedDiscount,
      recall_date_override: recallOverride || null,
      client_request_id: clientRequestId,
    });

    if (visitRes.ok === false) {
      if (isAlreadySavedError(visitRes.error)) {
        // The visit from an earlier attempt of this same form instance already exists -- that's
        // success, per the idempotency contract. This particular response has no visit_id to
        // attach a prescription to, so if one was pending, say so plainly rather than silently
        // drop it (this is a rare edge case: it only happens if this exact submit was somehow
        // retried at a lower level than the submitting-state guard already prevents).
        if (hasRxContent) {
          setErrorMsg(
            "The visit was already saved, but the prescription could not be linked automatically. Please refresh and re-enter it.",
          );
          setSubmitting(false);
          return { ok: false, prescriptionId: null };
        }
        toastSuccess("Visit and recall recorded successfully.");
        setSubmitting(false);
        onOpenChange(false);
        if (onSuccess) onSuccess();
        return { ok: true, prescriptionId: null };
      }
      setErrorMsg(visitRes.error);
      setSubmitting(false);
      return { ok: false, prescriptionId: null };
    }

    const newVisitId = visitRes.data.visit_id;

    if (!hasRxContent) {
      toastSuccess("Visit and recall recorded successfully.");
      setSubmitting(false);
      onOpenChange(false);
      if (onSuccess) onSuccess();
      return { ok: true, prescriptionId: null };
    }

    // 3. Create the prescription, linked to the visit that now definitely exists.
    return attemptPrescriptionSave(newVisitId, activePatientId, activeBranchId!);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await performSave();
  }

  /** Opens a blank tab SYNCHRONOUSLY, before any await, so the browser still attributes it to
   * this click and the popup blocker lets it through -- an open() called after an await is no
   * longer inside the user-gesture window and gets silently blocked in most browsers. Only ever
   * navigated to the print page on a save that both succeeded AND produced a prescription id;
   * any other outcome closes it again rather than leaving a blank tab behind. */
  async function handleSaveAndPrint() {
    const win = window.open("", "_blank");
    const result = await performSave();
    if (!result.ok || !result.prescriptionId) {
      win?.close();
      return;
    }
    if (win) {
      win.location.href = `/app/prescriptions/${result.prescriptionId}/print?print=1`;
    }
  }

  // Live calculation for amount & discount
  const rawAmt = amount.trim() ? parseFloat(amount) : 0;
  const isAmtValid = !isNaN(rawAmt) && rawAmt >= 0;
  const displayAmt = isAmtValid ? rawAmt : 0;

  const rawDisc = discountPercent.trim() ? parseFloat(discountPercent) : 0;
  const isDiscValid = !isNaN(rawDisc) && rawDisc >= 0 && rawDisc <= 100;
  const displayDiscPercent = isDiscValid ? rawDisc : 0;

  const discountVal = (isAmtValid && isDiscValid && displayDiscPercent > 0)
    ? Math.round((displayAmt * displayDiscPercent) / 100)
    : 0;
  const finalBillVal = isAmtValid && isDiscValid
    ? Math.max(0, displayAmt - discountVal)
    : displayAmt;

  const retryingRxOnly = Boolean(savedVisitId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="sm:max-w-[760px] max-w-full">
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            Add Visit & Recall
          </DialogTitle>
          <DialogDescription>
            Record a patient treatment visit. Next recall is automatically computed.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {retryingRxOnly && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
            <ClipboardPlus className="h-4 w-4 shrink-0 text-primary" />
            <span>The visit is saved. Only the prescription below still needs to be submitted.</span>
          </div>
        )}

        <div className="flex flex-col gap-4 py-4 max-h-[65vh] overflow-y-auto px-1">
          <fieldset disabled={retryingRxOnly} className="flex flex-col gap-4 disabled:opacity-50">
            {/* Patient Selector or Inline Creation */}
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-foreground">Patient *</Label>
                <button
                  type="button"
                  onClick={() => {
                    setIsInlinePatient(!isInlinePatient);
                    setErrorMsg(null);
                  }}
                  className="text-xs text-primary underline underline-offset-2 font-medium"
                >
                  {isInlinePatient ? "Select Existing Patient" : "+ New Patient Inline"}
                </button>
              </div>

              {isInlinePatient ? (
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="flex flex-col gap-1">
                    <Input
                      placeholder="Full Name *"
                      value={inlineName}
                      onChange={(e) => setInlineName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Input
                      placeholder="10-digit Mobile *"
                      maxLength={10}
                      value={inlineMobile}
                      onChange={(e) => setInlineMobile(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                  {profile?.role === "owner" && branches.length > 1 && (
                    <div className="flex flex-col gap-1 col-span-2">
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                        value={inlineBranchId}
                        onChange={(e) => setInlineBranchId(e.target.value)}
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            Branch: {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <PatientSearchSelect
                  patients={patients}
                  value={patientId}
                  onChange={(id) => setPatientId(id)}
                  required
                />
              )}
            </div>

            {/* Treatment Type & Visit Date */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-tt">Treatment Type *</Label>
                <select
                  id="v-tt"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={treatmentTypeId}
                  onChange={(e) => setTreatmentTypeId(e.target.value)}
                  required
                >
                  {treatmentTypes.map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.name} ({tt.recall_days}d recall)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-date">Visit Date *</Label>
                <Input
                  id="v-date"
                  type="date"
                  required
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                />
              </div>
            </div>

            {/* Live Computed Recall & Override Field */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-foreground">
                  Next Recall Date ({recallDays} days default)
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {recallOverride ? `Computed: ${formatDateIST(recallOverride)}` : "Select treatment date"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="v-override" className="text-xs shrink-0">
                  Override:
                </Label>
                <Input
                  id="v-override"
                  type="date"
                  value={recallOverride}
                  onChange={(e) => setRecallOverride(e.target.value)}
                  className="h-8 w-36 text-xs bg-background"
                />
              </div>
            </div>

            {/* Tooth Chart Selector */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-foreground">Select Teeth (Optional)</Label>
              <ToothChart
                value={selectedTeeth}
                onChange={setSelectedTeeth}
              />
            </div>

            {/* Amount & Discount % */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-amt">Amount Charged (₹) *</Label>
                <Input
                  id="v-amt"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. 5000 (or 0 if free)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="v-disc">Discount %</Label>
                <Input
                  id="v-disc"
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

            {/* Live Calculation breakdown */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-muted-foreground">
                <span>Amount</span>
                <span>{formatINR(displayAmt)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span>{displayDiscPercent > 0 && isDiscValid ? `− ${formatINR(discountVal)}` : "—"}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold text-foreground text-sm">
                <span>Final bill</span>
                <span>{formatINR(finalBillVal)}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-notes">Clinical / Visit Notes</Label>
              <Input
                id="v-notes"
                placeholder="e.g. Scaling done, advised warm saline rinse"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </fieldset>

          {/* Prescription -- collapsed, owner/super_admin only, absent entirely for a
             receptionist rather than merely disabled. */}
          {canPrescribe && (
            <div className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setShowRx(!showRx)}
                disabled={retryingRxOnly}
                className="flex w-full items-center justify-between p-3 text-left disabled:opacity-70"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <ClipboardPlus className="h-3.5 w-3.5 text-primary" />
                  Add Prescription
                </span>
                {showRx ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {showRx && (
                <div className="border-t border-border p-3">
                  <PrescriptionSection value={rxDraft} onChange={setRxDraft} />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          {/* Doctor-only, same gate as the prescription section itself -- printing a prescription
             only makes sense for the person who can write one. */}
          {canPrescribe && (
            <Button type="button" variant="outline" onClick={handleSaveAndPrint} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Printer className="h-4 w-4 mr-2" />}
              Save & Print
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {retryingRxOnly ? "Retry Prescription" : "Record Visit & Recall"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
