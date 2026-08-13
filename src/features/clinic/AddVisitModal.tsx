import { useEffect, useState, type FormEvent } from "react";
import { Search, Stethoscope, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { createVisitWithRecall } from "@/lib/clinic-api";
import { todayIST, formatDateIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

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

  const [treatmentTypes, setTreatmentTypes] = useState<TreatmentTypeRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);

  // Form Fields
  const [patientId, setPatientId] = useState<string>(initialPatientId || "");
  const [patientSearch, setPatientSearch] = useState("");
  const [isInlinePatient, setIsInlinePatient] = useState(false);

  // Inline Patient Fields
  const [inlineName, setInlineName] = useState("");
  const [inlineMobile, setInlineMobile] = useState("");
  const [inlineBranchId, setInlineBranchId] = useState("");

  const [treatmentTypeId, setTreatmentTypeId] = useState("");
  const [visitDate, setVisitDate] = useState(todayIST());
  const [toothNumbers, setToothNumbers] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [recallOverride, setRecallOverride] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialPatientId) {
      setPatientId(initialPatientId);
    }
  }, [initialPatientId]);

  useEffect(() => {
    if (!open) return;
    loadRefData();
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

  const filteredPatients = patients.filter((p) => {
    if (!patientSearch.trim()) return true;
    const q = patientSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.mobile.includes(q);
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    let activePatientId = patientId;

    // 1. Create Inline Patient if toggled
    if (isInlinePatient) {
      if (!inlineName.trim()) {
        setErrorMsg("Please enter patient name.");
        setSubmitting(false);
        return;
      }
      if (!/^\d{10}$/.test(inlineMobile.trim())) {
        setErrorMsg("Mobile number must be exactly 10 digits.");
        setSubmitting(false);
        return;
      }
      const targetBranchId = profile?.role === "receptionist" ? profile.branch_id : inlineBranchId;
      if (!targetBranchId) {
        setErrorMsg("Please select a branch for the new patient.");
        setSubmitting(false);
        return;
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
        return;
      }
      activePatientId = newP.id;
    }

    if (!activePatientId) {
      setErrorMsg("Please select or create a patient.");
      setSubmitting(false);
      return;
    }

    if (!treatmentTypeId) {
      setErrorMsg("Please select a treatment type.");
      setSubmitting(false);
      return;
    }

    // 2. Call createVisitWithRecall
    const res = await createVisitWithRecall({
      patient_id: activePatientId,
      treatment_type_id: treatmentTypeId,
      visit_date: visitDate,
      tooth_numbers: toothNumbers.trim() || null,
      notes: notes.trim() || null,
      amount: amount ? parseFloat(amount) : null,
      recall_date_override: recallOverride || null,
    });

    if (res.ok === false) {
      setErrorMsg(res.error);
      setSubmitting(false);
      return;
    }

    toastSuccess("Visit and recall recorded successfully.");
    setSubmitting(false);
    onOpenChange(false);
    if (onSuccess) onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        <div className="flex flex-col gap-4 py-4 max-h-[65vh] overflow-y-auto px-1">
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
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search patient by name or mobile..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="pl-8 h-9 text-xs"
                  />
                </div>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  required
                >
                  <option value="">-- Select Patient --</option>
                  {filteredPatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.mobile})
                    </option>
                  ))}
                </select>
              </div>
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

          {/* Tooth Numbers & Amount */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-tooth">Tooth Numbers</Label>
              <Input
                id="v-tooth"
                placeholder="e.g. 16, 17 or Upper Molar"
                value={toothNumbers}
                onChange={(e) => setToothNumbers(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-amt">Amount Charged (₹)</Label>
              <Input
                id="v-amt"
                type="number"
                step="0.01"
                placeholder="e.g. 1500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Total amount charged for this treatment
              </p>
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
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Record Visit & Recall
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
