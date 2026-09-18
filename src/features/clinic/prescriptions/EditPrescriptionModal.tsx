import { useEffect, useState } from "react";
import { AlertCircle, ClipboardEdit, Loader2 } from "lucide-react";
import { fetchPrescriptionById, updatePrescription, type UpdatePrescriptionInput } from "@/lib/clinic-api";
import { todayIST } from "@/lib/dates";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ToothChart } from "@/features/clinic/dental-chart/ToothChart";
import {
  PrescriptionSection,
  emptyPrescriptionDraft,
  draftToMedicalHistoryJson,
  draftToInvestigationJson,
  draftToMedications,
  medicalHistoryJsonToDraft,
  investigationJsonToDraft,
  medicationsJsonToDraft,
  type PrescriptionDraft,
} from "@/features/clinic/PrescriptionSection";

// ---------------------------------------------------------------------------
// Edits ONLY the prescriptions row -- doctor_name, prescribed_on, vitals, history,
// investigation, diagnosis, treatment plan, teeth, medications, notes. Deliberately separate
// from AddVisitModal's merged visit+prescription form: this modal never touches the linked
// visit's amount/discount/treatment_type or any recall, and updatePrescription's input type
// structurally excludes clinic_id/patient_id/branch_id/visit_id/client_request_id -- the server
// (protect_prescription_immutable_fields) blocks them too, but this is the first line of defense.
// ---------------------------------------------------------------------------

interface EditPrescriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescriptionId: string | null;
  /** For the tooth chart's layout (adult vs primary dentition) -- the patient's own setting,
   * passed down from the patient detail page. Defaults to "adult" when unknown. */
  dentitionType?: "adult" | "child";
  onSuccess?: () => void;
}

export function EditPrescriptionModal({
  open,
  onOpenChange,
  prescriptionId,
  dentitionType = "adult",
  onSuccess,
}: EditPrescriptionModalProps) {
  const { success: toastSuccess } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [prescribedOn, setPrescribedOn] = useState(todayIST());
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
  const [draft, setDraft] = useState<PrescriptionDraft>(emptyPrescriptionDraft(""));

  // Load the prescription fresh every time the modal opens for a given id -- an edit started,
  // cancelled, then reopened must never show stale in-memory state from the previous open.
  useEffect(() => {
    if (!open || !prescriptionId) return;
    let active = true;
    setLoading(true);
    setErrorMsg(null);
    fetchPrescriptionById(prescriptionId).then((res) => {
      if (!active) return;
      if (!res.ok) {
        setErrorMsg(res.error);
        setLoading(false);
        return;
      }
      const p = res.data;
      setPrescribedOn(p.prescribed_on);
      setSelectedTeeth(p.teeth ?? []);
      setDraft({
        occupation: p.occupation ?? "",
        height: p.height ?? "",
        weight: p.weight ?? "",
        blood_pressure: p.blood_pressure ?? "",
        spo2: p.spo2 ?? "",
        chief_complaint: p.chief_complaint ?? "",
        medical_history: medicalHistoryJsonToDraft(p.medical_history),
        past_dental_history: p.past_dental_history ?? "",
        oral_examination: p.oral_examination ?? "",
        investigation: investigationJsonToDraft(p.investigation),
        provisional_diagnosis: p.provisional_diagnosis ?? "",
        treatment_plan: p.treatment_plan ?? "",
        medications: medicationsJsonToDraft(p.medications),
        notes: p.notes ?? "",
        doctor_name: p.doctor_name ?? "",
      });
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, prescriptionId]);

  async function handleSave() {
    if (!prescriptionId) return;
    if (!draft.doctor_name.trim()) {
      setErrorMsg("Doctor name is required.");
      return;
    }
    if (!prescribedOn) {
      setErrorMsg("Prescribed date is required.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const input: UpdatePrescriptionInput = {
      doctor_name: draft.doctor_name.trim(),
      prescribed_on: prescribedOn,
      occupation: draft.occupation.trim() || null,
      height: draft.height.trim() || null,
      weight: draft.weight.trim() || null,
      blood_pressure: draft.blood_pressure.trim() || null,
      spo2: draft.spo2.trim() || null,
      chief_complaint: draft.chief_complaint.trim() || null,
      medical_history: draftToMedicalHistoryJson(draft.medical_history),
      past_dental_history: draft.past_dental_history.trim() || null,
      oral_examination: draft.oral_examination.trim() || null,
      investigation: draftToInvestigationJson(draft.investigation),
      provisional_diagnosis: draft.provisional_diagnosis.trim() || null,
      treatment_plan: draft.treatment_plan.trim() || null,
      teeth: selectedTeeth.length > 0 ? selectedTeeth : null,
      medications: draftToMedications(draft.medications),
      notes: draft.notes.trim() || null,
    };

    const res = await updatePrescription(prescriptionId, input);
    setSaving(false);

    if (!res.ok) {
      // Covers both a real error and an RLS-blocked update (0 rows -- updatePrescription's
      // .single() turns that into an error here too), so this branch is the single place that
      // handles "the save did not happen," not just "the request errored."
      setErrorMsg(res.error);
      return;
    }

    toastSuccess("Prescription updated.");
    onOpenChange(false);
    if (onSuccess) onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="sm:max-w-[760px] max-w-full">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ClipboardEdit className="h-5 w-5 text-primary" />
          Edit Prescription
        </DialogTitle>
        <DialogDescription>
          Update this prescription's clinical details. The linked visit, its amount, and any recall are not affected.
        </DialogDescription>
      </DialogHeader>

      {errorMsg && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex flex-col gap-5 py-4 max-h-[65vh] overflow-y-auto px-1">
        {loading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rx-edit-prescribed-on">Prescribed On *</Label>
              <Input
                id="rx-edit-prescribed-on"
                type="date"
                required
                max={todayIST()}
                value={prescribedOn}
                onChange={(e) => setPrescribedOn(e.target.value)}
                className="max-w-[200px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-foreground">Teeth</Label>
              <ToothChart value={selectedTeeth} onChange={setSelectedTeeth} dentitionType={dentitionType} />
            </div>

            <PrescriptionSection value={draft} onChange={setDraft} />
          </>
        )}
      </div>

      <DialogFooter className="border-t border-border pt-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving || loading}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          Save Changes
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
