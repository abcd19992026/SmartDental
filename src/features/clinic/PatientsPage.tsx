import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  Stethoscope,
  Clock,
  Edit2,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  User,
  Pause,
  Play,
  Activity,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { formatDateIST } from "@/lib/dates";
import {
  createPatientAndQueue,
  updatePatientClinicalProfile,
  DEFAULT_MEDICAL_HISTORY,
  type MedicalHistory,
  fetchBillingSummary,
  fetchPaymentHistory,
  type PatientBillingSummary,
  type PatientPaymentHistoryEntry,
} from "@/lib/clinic-api";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { BillingBanner } from "@/features/clinic/billing/BillingBanner";
import { PaymentHistoryCard } from "@/features/clinic/billing/PaymentHistoryCard";
import { AddPaymentModal } from "@/features/clinic/billing/AddPaymentModal";
import { PrescriptionsCard } from "@/features/clinic/prescriptions/PrescriptionsCard";
import { cn, formatINR } from "@/lib/utils";

type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type BranchRow = Database["public"]["Tables"]["branches"]["Row"];
type VisitRow = Database["public"]["Tables"]["visits"]["Row"];
type RecallRow = Database["public"]["Tables"]["recalls"]["Row"];
type TreatmentTypeRow = Database["public"]["Tables"]["treatment_types"]["Row"];

interface JoinedPatient extends PatientRow {
  branch?: BranchRow | null;
  visits?: (VisitRow & { treatment_type?: TreatmentTypeRow | null })[];
  recalls?: RecallRow[];
  /** id + visit_id only -- just enough to tell which visits already have a prescription, for the
   * "+ Prescription" link on visits that don't (Phase 13A, Task 4). */
  prescriptions?: { id: string; visit_id: string | null }[];
}

const MEDICAL_HISTORY_TOGGLES: Array<{
  key: keyof Omit<MedicalHistory, "allergies_detail" | "other_text">;
  label: string;
}> = [
    { key: "diabetes", label: "Diabetes" },
    { key: "hypertension", label: "Hypertension" },
    { key: "thyroid", label: "Thyroid" },
    { key: "asthma", label: "Asthma" },
    { key: "tuberculosis", label: "Tuberculosis" },
    { key: "cardiac", label: "Cardiac" },
    { key: "arthritis", label: "Arthritis" },
    { key: "allergies", label: "Allergies" },
    { key: "other", label: "Other" },
  ];

export function PatientsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activePatientId = searchParams.get("id");

  const { profile } = useAuth();
  const { toast, success, error: toastError } = useToast();

  const [patients, setPatients] = useState<JoinedPatient[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Add / Edit Patient Panel
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [patientModalStep, setPatientModalStep] = useState<1 | 2>(1);
  const [editingPatient, setEditingPatient] = useState<PatientRow | null>(null);
  const [addToTodayQueue, setAddToTodayQueue] = useState(true);

  // Per-visit check-in vitals for new patient queue entry
  const [queueWeight, setQueueWeight] = useState("");
  const [queueBloodPressure, setQueueBloodPressure] = useState("");
  const [queueSpo2, setQueueSpo2] = useState("");
  const [queueChiefComplaint, setQueueChiefComplaint] = useState("");
  const [queuePastDentalHistory, setQueuePastDentalHistory] = useState("");
  const [patientForm, setPatientForm] = useState<{
    name: string;
    mobile: string;
    alt_mobile: string;
    age: string;
    gender: string;
    address: string;
    notes: string;
    branch_id: string;
    occupation: string;
    height: string;
    dentition_type: "adult" | "child";
    medical_history: MedicalHistory;
  }>({
    name: "",
    mobile: "",
    alt_mobile: "",
    age: "",
    gender: "male",
    address: "",
    notes: "",
    branch_id: "",
    occupation: "",
    height: "",
    dentition_type: "adult",
    medical_history: { ...DEFAULT_MEDICAL_HISTORY },
  });

  // Duplicate mobile handling
  const [duplicateMatchId, setDuplicateMatchId] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Add Visit Modal State

  // Billing & Payment States
  const [billingSummary, setBillingSummary] = useState<PatientBillingSummary | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PatientPaymentHistoryEntry[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);

  // Visit History Timeline collapsible dropdown state
  const [visitTimelineOpen, setVisitTimelineOpen] = useState(false);

  // Bumped whenever a visit save might have created a prescription, so PrescriptionsCard reloads.
  const [prescriptionsRefreshKey] = useState(0);

  useEffect(() => {
    loadPatientsData();
  }, []);

  async function loadBillingData(patientId: string) {
    setBillingLoading(true);
    const [sRes, pRes] = await Promise.all([
      fetchBillingSummary(patientId),
      fetchPaymentHistory(patientId),
    ]);
    if (sRes.ok) {
      setBillingSummary(sRes.data);
    } else {
      setBillingSummary(null);
    }
    if (pRes.ok) {
      setPaymentHistory(pRes.data);
    } else {
      setPaymentHistory([]);
    }
    setBillingLoading(false);
  }

  useEffect(() => {
    if (activePatientId) {
      loadBillingData(activePatientId);
    } else {
      setBillingSummary(null);
      setPaymentHistory([]);
    }
  }, [activePatientId]);

  async function loadPatientsData() {
    setLoading(true);
    setError(null);

    const [pRes, bRes] = await Promise.all([
      supabase
        .from("patients")
        .select("*, branch:branches(*), visits(*, treatment_type:treatment_types(*)), recalls(*), prescriptions(id, visit_id)")
        .order("created_at", { ascending: false }),
      supabase.from("branches").select("*").eq("is_active", true),
    ]);

    if (pRes.error) {
      setError(pRes.error.message);
      setLoading(false);
      return;
    }

    setPatients((pRes.data as JoinedPatient[]) || []);
    if (bRes.data) {
      setBranches(bRes.data);
      if (bRes.data.length > 0 && !patientForm.branch_id) {
        setPatientForm((prev) => ({ ...prev, branch_id: profile?.branch_id || bRes.data[0].id }));
      }
    }

    setLoading(false);
  }

  // Active Patient Detail Object
  const selectedPatient = activePatientId ? patients.find((p) => p.id === activePatientId) : null;

  // Filtered Patients List
  const filteredPatients = patients.filter((p) => {
    if (profile?.role === "owner" && selectedBranchId !== "all") {
      if (p.branch_id !== selectedBranchId) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchMobile = p.mobile.includes(q);
      if (!matchName && !matchMobile) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredPatients.length / pageSize) || 1;
  const paginatedPatients = filteredPatients.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Open Add Patient Modal
  function openAddPatient() {
    setEditingPatient(null);
    setDuplicateMatchId(null);
    setDuplicateError(null);
    setAddToTodayQueue(true);
    setPatientModalStep(1);
    setQueueWeight("");
    setQueueBloodPressure("");
    setQueueSpo2("");
    setQueueChiefComplaint("");
    setQueuePastDentalHistory("");
    setPatientForm({
      name: "",
      mobile: "",
      alt_mobile: "",
      age: "",
      gender: "male",
      address: "",
      notes: "",
      branch_id: profile?.branch_id || (branches[0]?.id ?? ""),
      occupation: "",
      height: "",
      dentition_type: "adult",
      medical_history: { ...DEFAULT_MEDICAL_HISTORY },
    });
    setPatientModalOpen(true);
  }

  // Open Edit Patient Modal
  function openEditPatient(p: PatientRow) {
    setEditingPatient(p);
    setDuplicateMatchId(null);
    setDuplicateError(null);
    setPatientModalStep(1);
    setQueueWeight("");
    setQueueBloodPressure("");
    setQueueSpo2("");
    setQueueChiefComplaint("");
    setQueuePastDentalHistory("");
    const pMedHistory =
      p.medical_history && typeof p.medical_history === "object"
        ? (p.medical_history as unknown as Partial<MedicalHistory>)
        : null;

    setPatientForm({
      name: p.name,
      mobile: p.mobile,
      alt_mobile: p.alt_mobile || "",
      age: p.age ? String(p.age) : "",
      gender: p.gender || "male",
      address: p.address || "",
      notes: p.notes || "",
      branch_id: p.branch_id,
      occupation: p.occupation || "",
      height: p.height || "",
      dentition_type: (p.dentition_type as "adult" | "child") || "adult",
      medical_history: {
        ...DEFAULT_MEDICAL_HISTORY,
        ...(pMedHistory || {}),
      },
    });
    setPatientModalOpen(true);
  }

  // Advance from Step 1 to Step 2 in Add Patient Modal
  function handleNextStep() {
    if (!patientForm.name.trim()) {
      toastError("Patient name is required.", "Validation Error");
      return;
    }
    if (!/^\d{10}$/.test(patientForm.mobile.trim())) {
      toastError("Mobile number must be exactly 10 digits.", "Validation Error");
      return;
    }
    if (!patientForm.branch_id) {
      toastError("Please select a branch.", "Validation Error");
      return;
    }
    setPatientModalStep(2);
  }

  // Save Patient
  async function handleSavePatient(e: FormEvent) {
    e.preventDefault();
    setDuplicateError(null);
    setDuplicateMatchId(null);

    if (!patientForm.name.trim()) {
      toastError("Patient name is required.", "Validation Error");
      return;
    }
    if (!/^\d{10}$/.test(patientForm.mobile.trim())) {
      toastError("Mobile number must be exactly 10 digits.", "Validation Error");
      return;
    }
    if (!patientForm.branch_id) {
      toastError("Please select a branch.", "Validation Error");
      return;
    }

    const sanitizedMedicalHistory: MedicalHistory = {
      ...patientForm.medical_history,
      allergies_detail: patientForm.medical_history.allergies
        ? patientForm.medical_history.allergies_detail?.trim() || null
        : null,
      other_text: patientForm.medical_history.other
        ? patientForm.medical_history.other_text?.trim() || null
        : null,
    };

    if (editingPatient) {
      const { error: err } = await supabase
        .from("patients")
        .update({
          name: patientForm.name.trim(),
          mobile: patientForm.mobile.trim(),
          alt_mobile: patientForm.alt_mobile.trim() || null,
          age: patientForm.age ? parseInt(patientForm.age) : null,
          gender: patientForm.gender as any,
          address: patientForm.address.trim() || null,
          notes: patientForm.notes.trim() || null,
          branch_id: patientForm.branch_id,
        })
        .eq("id", editingPatient.id);

      if (err) {
        if (err.code === "23505") {
          // Unique mobile violation
          const existing = patients.find((p) => p.mobile === patientForm.mobile.trim() && p.id !== editingPatient.id);
          setDuplicateError("A patient with this mobile number already exists.");
          if (existing) setDuplicateMatchId(existing.id);
        } else {
          toastError(err.message, "Update Failed");
        }
        return;
      }

      const clinicalRes = await updatePatientClinicalProfile(editingPatient.id, {
        occupation: patientForm.occupation.trim() || null,
        height: patientForm.height.trim() || null,
        dentition_type: patientForm.dentition_type,
        medical_history: sanitizedMedicalHistory,
      });

      if (!clinicalRes.ok) {
        toastError(clinicalRes.error, "Clinical Profile Update Failed");
        return;
      }

      success("Patient details updated.");
      setPatientModalOpen(false);
      loadPatientsData();
    } else {
      const result = await createPatientAndQueue({
        clinic_id: profile?.clinic_id!,
        branch_id: patientForm.branch_id,
        name: patientForm.name.trim(),
        mobile: patientForm.mobile.trim(),
        alt_mobile: patientForm.alt_mobile.trim() || null,
        age: patientForm.age ? parseInt(patientForm.age) : null,
        gender: (patientForm.gender as "male" | "female" | "other") || null,
        address: patientForm.address.trim() || null,
        notes: patientForm.notes.trim() || null,
        occupation: patientForm.occupation.trim() || null,
        height: patientForm.height.trim() || null,
        dentition_type: patientForm.dentition_type,
        medical_history: sanitizedMedicalHistory,
        addToTodayQueue,
        weight: addToTodayQueue ? queueWeight.trim() || null : null,
        blood_pressure: addToTodayQueue ? queueBloodPressure.trim() || null : null,
        spo2: addToTodayQueue ? queueSpo2.trim() || null : null,
        chief_complaint: addToTodayQueue ? queueChiefComplaint.trim() || null : null,
        past_dental_history: addToTodayQueue ? queuePastDentalHistory.trim() || null : null,
      });

      if (!result.ok) {
        if (
          result.error.includes("23505") ||
          result.error.toLowerCase().includes("duplicate") ||
          result.error.toLowerCase().includes("unique")
        ) {
          const existing = patients.find((p) => p.mobile === patientForm.mobile.trim());
          setDuplicateError("This patient already exists — open record?");
          if (existing) setDuplicateMatchId(existing.id);
        } else {
          toastError(result.error, "Save Failed");
        }
        return;
      }

      if (result.data.queued === true) {
        success("Patient created and added to today's queue.");
      } else if (result.data.queueError) {
        toast({
          title: "Patient created",
          description: "Could not add to today's queue — add manually via +Walk-in on the Today page.",
          type: "info",
        });
      } else {
        success("Patient created successfully.");
      }

      setPatientModalOpen(false);
      loadPatientsData();
      if (result.data?.patient) setSearchParams({ id: result.data.patient.id });
    }
  }

  // Toggle Do Not Disturb
  async function handleToggleDND(p: PatientRow) {
    const nextDND = !p.do_not_disturb;
    const { error: err } = await supabase
      .from("patients")
      .update({ do_not_disturb: nextDND })
      .eq("id", p.id);

    if (err) {
      toastError(err.message, "Update Failed");
      return;
    }

    success(nextDND ? "Patient placed on Do Not Disturb." : "Do Not Disturb removed.");
    loadPatientsData();
  }

  async function handleTogglePause(r: RecallRow) {
    const newStatus = r.status === "paused" ? "pending" : "paused";
    const { error: err } = await supabase
      .from("recalls")
      .update({ status: newStatus })
      .eq("id", r.id);

    if (err) {
      toastError(err.message, "Action Failed");
      return;
    }

    success(`Recall ${newStatus === "paused" ? "paused" : "resumed"}.`);
    loadPatientsData();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-foreground">Patients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Patient directory, medical history timelines, and active recall tracking
          </p>
        </div>
        <Button onClick={openAddPatient}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Patient
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* VIEW A: Patient Detail View */}
      {selectedPatient ? (() => {
        const selectedPatientMedHistory: MedicalHistory =
          selectedPatient.medical_history && typeof selectedPatient.medical_history === "object"
            ? {
              ...DEFAULT_MEDICAL_HISTORY,
              ...(selectedPatient.medical_history as unknown as Partial<MedicalHistory>),
            }
            : DEFAULT_MEDICAL_HISTORY;

        const activeConditions: string[] = [];
        if (selectedPatientMedHistory.diabetes) activeConditions.push("Diabetes");
        if (selectedPatientMedHistory.hypertension) activeConditions.push("Hypertension");
        if (selectedPatientMedHistory.thyroid) activeConditions.push("Thyroid");
        if (selectedPatientMedHistory.asthma) activeConditions.push("Asthma");
        if (selectedPatientMedHistory.tuberculosis) activeConditions.push("Tuberculosis");
        if (selectedPatientMedHistory.cardiac) activeConditions.push("Cardiac");
        if (selectedPatientMedHistory.arthritis) activeConditions.push("Arthritis");
        if (selectedPatientMedHistory.other) {
          const otherText = selectedPatientMedHistory.other_text?.trim();
          if (otherText) {
            activeConditions.push(otherText);
          } else {
            activeConditions.push("Other");
          }
        }

        return (
          <div className="flex flex-col gap-6">
            {/* Unified Patient Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-4">
              {/* Left side: Back Button + Patient Name + DND Badge + Allergy Banner */}
              <div className="flex items-start gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSearchParams({})}
                  title="Back to Patient List"
                  className="h-9 w-9 shrink-0 mt-0.5"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{selectedPatient.name}</h2>
                    {selectedPatient.do_not_disturb && (
                      <Badge variant="outline" className="border-amber-200 text-amber-800 bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 text-xs">
                        Do Not Disturb
                      </Badge>
                    )}
                  </div>

                  {/* TASK 2: Prominent Red Allergy Banner (single warning icon) */}
                  {selectedPatientMedHistory.allergies && (
                    <div className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-600 text-white dark:bg-red-950/90 dark:border dark:border-red-600 dark:text-red-200 text-xs sm:text-sm font-semibold tracking-wide shadow-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-white dark:text-red-400" />
                      <span>
                        {selectedPatientMedHistory.allergies_detail && selectedPatientMedHistory.allergies_detail.trim()
                          ? `Allergy: ${selectedPatientMedHistory.allergies_detail.trim()}`
                          : "Allergy noted (no details recorded)"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right side: Billing Numbers + Record Visit Button */}
              <div className="flex items-center gap-6 sm:gap-8 lg:gap-12 flex-wrap sm:flex-nowrap justify-between lg:justify-end">
                <BillingBanner summary={billingSummary} loading={billingLoading} />
                <div className="h-8 w-px bg-border hidden sm:block shrink-0" />
                <Button
                  size="sm"
                  onClick={() => navigate(`/app/patients/${selectedPatient.id}/consultation`)}
                  className="shadow-sm shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Record Visit
                </Button>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {/* Patient Profile Card */}
              <Card className="md:col-span-1">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    Patient Info
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditPatient(selectedPatient)}
                    className="h-8 px-2.5 text-xs"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                    Edit Profile
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Mobile</span>
                    <span className="font-medium text-foreground">{selectedPatient.mobile}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Alt Mobile</span>
                    <span className="text-foreground">{selectedPatient.alt_mobile || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Age / Gender</span>
                    <span className="font-medium capitalize text-foreground">
                      {selectedPatient.age ? `${selectedPatient.age} yrs` : "—"} / {selectedPatient.gender || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Branch</span>
                    <span className="text-foreground">{selectedPatient.branch?.name || "Main"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Occupation</span>
                    <span className="text-foreground">{selectedPatient.occupation || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Height</span>
                    <span className="text-foreground">{selectedPatient.height || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Tooth Chart Type</span>
                    <span className="text-foreground capitalize">{selectedPatient.dentition_type || "adult"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Medical Conditions</span>
                    <span className="text-foreground font-medium">
                      {activeConditions.length > 0 ? activeConditions.join(" · ") : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Address</span>
                    <span className="text-foreground">{selectedPatient.address || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Clinical Notes</span>
                    <span className="text-foreground">{selectedPatient.notes || "—"}</span>
                  </div>

                  {/* DND Toggle Box */}
                  <div className="rounded-lg border border-border bg-muted/30 p-3 mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">Do Not Disturb</span>
                      <Button
                        variant={selectedPatient.do_not_disturb ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => handleToggleDND(selectedPatient)}
                        className="h-7 text-xs"
                      >
                        {selectedPatient.do_not_disturb ? "Disable DND" : "Enable DND"}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Excludes this patient from all automated recall reminders.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Visit, Payment & Recall Timelines */}
              <div className="md:col-span-2 flex flex-col gap-6">
                {/* Prescriptions */}
                <PrescriptionsCard patientId={selectedPatient.id} refreshKey={prescriptionsRefreshKey} />

                {/* Visit History Timeline (Collapsible Dropdown) */}
                <Card>
                  <CardHeader
                    className="flex flex-row items-center justify-between cursor-pointer select-none py-3.5 hover:bg-muted/40 transition-colors rounded-t-lg"
                    onClick={() => setVisitTimelineOpen((prev) => !prev)}
                  >
                    <div className="flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base font-medium">
                        Visit History Timeline
                      </CardTitle>
                      <Badge variant="outline" className="text-xs font-normal ml-1">
                        {selectedPatient.visits?.length || 0} {selectedPatient.visits?.length === 1 ? "visit" : "visits"}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          visitTimelineOpen && "rotate-180"
                        )}
                      />
                    </Button>
                  </CardHeader>
                  {visitTimelineOpen && (
                    <CardContent className="pt-2 border-t border-border">
                      {!selectedPatient.visits || selectedPatient.visits.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No visits recorded yet for this patient.
                        </p>
                      ) : (
                        <div className="relative border-l-2 border-primary/20 ml-3 pl-4 space-y-6 pt-2">
                          {selectedPatient.visits
                            .sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())
                            .map((v) => {
                              const hasPrescription = selectedPatient.prescriptions?.some((rx) => rx.visit_id === v.id) ?? false;
                              return (
                                <div key={v.id} className="relative">
                                  <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                    <span className="font-medium text-foreground text-sm">
                                      {v.treatment_type?.name || "Treatment Visit"}
                                    </span>
                                    <span className="text-xs text-muted-foreground font-mono">
                                      {formatDateIST(v.visit_date)}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1 space-y-1">
                                    {/* Teeth chips (renders pills if present, nothing if empty) */}
                                    {((v.teeth && v.teeth.length > 0) || (v.tooth_numbers && v.tooth_numbers.trim())) && (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <strong className="text-foreground">Teeth:</strong>
                                        {(v.teeth && v.teeth.length > 0
                                          ? [...v.teeth].sort((a, b) => a - b)
                                          : v.tooth_numbers!.split(",").map((s) => s.trim()).filter(Boolean)
                                        ).map((t) => (
                                          <Badge
                                            key={String(t)}
                                            variant="outline"
                                            className="h-5 px-1.5 py-0 border-teal-200 text-teal-800 bg-teal-100 dark:border-teal-500/30 dark:text-teal-400 dark:bg-teal-500/10 font-mono text-[11px] font-medium"
                                          >
                                            {t}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    {v.amount !== null && v.amount !== undefined && (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <strong>Amount:</strong>
                                        {v.discount_percent && v.discount_percent > 0 ? (
                                          <>
                                            <span className="line-through text-muted-foreground">
                                              {formatINR(v.amount)}
                                            </span>
                                            <Badge
                                              variant="outline"
                                              className="border-amber-200 text-amber-800 bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 text-[10px] py-0 px-1.5 font-normal"
                                            >
                                              {v.discount_percent}% off
                                            </Badge>
                                            <span className="font-semibold text-foreground">
                                              {formatINR(v.net_amount ?? Math.round(v.amount * (1 - v.discount_percent / 100)))}
                                            </span>
                                          </>
                                        ) : (
                                          <span className="font-medium text-foreground">
                                            {formatINR(v.net_amount ?? v.amount)}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {v.notes && <p><strong>Notes:</strong> {v.notes}</p>}
                                  </div>
                                  {/* Doc's Problem 1 (Phase 13A): a visit with no prescription can
                                 have one attached later, without re-billing it. */}
                                  {!hasPrescription && (
                                    <Link
                                      to={`/app/patients/${selectedPatient.id}/consultation?visitId=${v.id}`}
                                      className="text-xs text-primary underline underline-offset-2 font-medium mt-1.5 inline-block"
                                    >
                                      + Prescription
                                    </Link>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>

                {/* Payment History Card */}
                <PaymentHistoryCard
                  payments={paymentHistory}
                  loading={billingLoading}
                  onAddPayment={() => setAddPaymentOpen(true)}
                  onRefresh={() => {
                    loadBillingData(selectedPatient.id);
                    loadPatientsData();
                  }}
                />

                {/* Recalls History */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      Recalls (Past & Upcoming)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {!selectedPatient.recalls || selectedPatient.recalls.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-6 text-center">No recalls scheduled.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground uppercase">
                            <tr>
                              <th className="py-2.5 px-4">Due Date</th>
                              <th className="py-2.5 px-4">Status</th>
                              <th className="py-2.5 px-4 text-center">Attempts</th>
                              <th className="py-2.5 px-4">Last Attempt</th>
                              <th className="py-2.5 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {selectedPatient.recalls
                              .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())
                              .map((r) => {
                                const isPaused = r.status === "paused";
                                const isActionable = r.status !== "completed" && r.status !== "declined";

                                return (
                                  <tr key={r.id}>
                                    <td className="py-2.5 px-4 font-medium text-foreground">{formatDateIST(r.due_date)}</td>
                                    <td className="py-2.5 px-4">
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "capitalize font-normal text-[11px]",
                                          r.status === "pending" && "border-amber-200 text-amber-800 bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
                                          r.status === "sent" && "border-teal-200 text-teal-800 bg-teal-100 dark:border-primary/30 dark:text-primary dark:bg-primary/10",
                                          r.status === "booked" && "border-emerald-200 text-emerald-800 bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
                                          r.status === "contacted" && "border-amber-200 text-amber-800 bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
                                          r.status === "declined" && "border-muted text-muted-foreground bg-muted/20",
                                          r.status === "paused" && "border-slate-200 text-slate-700 bg-slate-100 dark:border-slate-500/30 dark:text-slate-400 dark:bg-slate-800/40"
                                        )}
                                      >
                                        {r.status}
                                      </Badge>
                                    </td>
                                    <td className="py-2.5 px-4 text-center">{r.attempt_count}</td>
                                    <td className="py-2.5 px-4 text-muted-foreground">
                                      {r.last_attempt_at ? formatDateIST(r.last_attempt_at.split("T")[0]) : "—"}
                                    </td>
                                    <td className="py-2.5 px-4 text-right">
                                      {isActionable ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          title={isPaused ? "Resume Recall" : "Pause Recall"}
                                          onClick={() => handleTogglePause(r)}
                                          className={cn(
                                            "h-7 px-2 text-xs",
                                            isPaused
                                              ? "text-emerald-800 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/40"
                                              : "text-amber-800 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/40"
                                          )}
                                        >
                                          {isPaused ? (
                                            <>
                                              <Play className="h-3 w-3 mr-1 text-emerald-600" />
                                              Resume
                                            </>
                                          ) : (
                                            <>
                                              <Pause className="h-3 w-3 mr-1 text-amber-600" />
                                              Pause
                                            </>
                                          )}
                                        </Button>
                                      ) : (
                                        <span className="text-muted-foreground/50 text-[11px]">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        );
      })() : (
        /* VIEW B: Patients Table View */
        <div className="flex flex-col gap-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient by name or mobile..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {profile?.role === "owner" && branches.length > 0 && (
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                value={selectedBranchId}
                onChange={(e) => {
                  setSelectedBranchId(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    Branch: {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <p className="text-sm text-muted-foreground">No patients found matching your search.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={openAddPatient}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    + Add Patient
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                      <tr>
                        <th className="py-3 px-4">Patient Name</th>
                        <th className="py-3 px-4">Mobile</th>
                        <th className="py-3 px-4">Branch</th>
                        <th className="py-3 px-4">Last Visit</th>
                        <th className="py-3 px-4">Next Recall</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedPatients.map((p) => {
                        const lastVisit = p.visits && p.visits.length > 0
                          ? [...p.visits].sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())[0]
                          : null;

                        const nextRecall = p.recalls && p.recalls.length > 0
                          ? [...p.recalls].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0]
                          : null;

                        return (
                          <tr
                            key={p.id}
                            onClick={() => setSearchParams({ id: p.id })}
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                          >
                            <td className="py-3.5 px-4 font-medium text-foreground">
                              {p.name}
                            </td>
                            <td className="py-3.5 px-4 text-muted-foreground">{p.mobile}</td>
                            <td className="py-3.5 px-4 text-muted-foreground">{p.branch?.name || "Main"}</td>
                            <td className="py-3.5 px-4 text-muted-foreground">
                              {lastVisit ? formatDateIST(lastVisit.visit_date) : "—"}
                            </td>
                            <td className="py-3.5 px-4 text-muted-foreground">
                              {nextRecall ? formatDateIST(nextRecall.due_date) : "—"}
                            </td>
                            <td className="py-3.5 px-4">
                              {p.do_not_disturb ? (
                                <Badge variant="outline" className="border-amber-200 text-amber-800 bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                                  DND
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-emerald-200 text-emerald-800 bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                                  Active
                                </Badge>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditPatient(p)}
                                className="h-8 px-2 text-xs"
                              >
                                <Edit2 className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
                  <div>
                    Page {currentPage} of {totalPages} ({filteredPatients.length} total patients)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="h-8"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="h-8"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add / Edit Patient Dialog / Panel */}
      <Dialog open={patientModalOpen} onOpenChange={setPatientModalOpen}>
        <form onSubmit={handleSavePatient}>
          <DialogHeader>
            <DialogTitle>
              {editingPatient
                ? "Edit Patient Record"
                : `Add New Patient — Step ${patientModalStep} of 2`}
            </DialogTitle>
            <DialogDescription>
              {editingPatient
                ? "Patient personal information and contact details"
                : patientModalStep === 1
                ? "Step 1 of 2: Personal Information & Contact Details"
                : "Step 2 of 2: Medical History & Clinical Profile"}
            </DialogDescription>
            {!editingPatient && (
              <div className="flex items-center gap-2 pt-1.5">
                <div
                  className={cn(
                    "flex-1 h-1.5 rounded-full transition-colors",
                    patientModalStep >= 1 ? "bg-primary" : "bg-muted"
                  )}
                />
                <div
                  className={cn(
                    "flex-1 h-1.5 rounded-full transition-colors",
                    patientModalStep >= 2 ? "bg-primary" : "bg-muted"
                  )}
                />
              </div>
            )}
          </DialogHeader>

          {/* Friendly Duplicate Mobile Prompt */}
          {duplicateError && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-600/30 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                <span className="font-medium">{duplicateError}</span>
              </div>
              {duplicateMatchId && (
                <div className="pt-1 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setPatientModalOpen(false);
                      setSearchParams({ id: duplicateMatchId });
                    }}
                  >
                    Open Existing Patient Record
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-4 py-4 max-h-[60vh] overflow-y-auto px-1">
            {/* STEP 1: Personal Information (or always visible in Edit mode) */}
            {(editingPatient || patientModalStep === 1) && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="p-name">Full Name *</Label>
                  <Input
                    id="p-name"
                    required
                    placeholder="e.g. Ramesh Patel"
                    value={patientForm.name}
                    onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-mob">Mobile (10 digits) *</Label>
                    <Input
                      id="p-mob"
                      required
                      maxLength={10}
                      placeholder="e.g. 9876543210"
                      value={patientForm.mobile}
                      onChange={(e) => setPatientForm({ ...patientForm, mobile: e.target.value.replace(/\D/g, "") })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-alt">Alt Mobile</Label>
                    <Input
                      id="p-alt"
                      placeholder="Optional secondary mobile"
                      value={patientForm.alt_mobile}
                      onChange={(e) => setPatientForm({ ...patientForm, alt_mobile: e.target.value.replace(/\D/g, "") })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-age">Age</Label>
                    <Input
                      id="p-age"
                      type="number"
                      placeholder="e.g. 35"
                      value={patientForm.age}
                      onChange={(e) => setPatientForm({ ...patientForm, age: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-gender">Gender</Label>
                    <select
                      id="p-gender"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={patientForm.gender}
                      onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                {profile?.role === "owner" && branches.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="p-branch">Branch *</Label>
                    <select
                      id="p-branch"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={patientForm.branch_id}
                      onChange={(e) => setPatientForm({ ...patientForm, branch_id: e.target.value })}
                      required
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="p-addr">Address</Label>
                  <Input
                    id="p-addr"
                    placeholder="Residential address"
                    value={patientForm.address}
                    onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="p-notes">Notes</Label>
                  <Input
                    id="p-notes"
                    placeholder="General patient notes or preferences"
                    value={patientForm.notes}
                    onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* STEP 2: Medical & Clinical (or visible in Edit mode) */}
            {(editingPatient || patientModalStep === 2) && (
              <>
                <div className={cn("space-y-4", editingPatient ? "border-t border-border pt-4 mt-2" : "")}>
                  <div className="flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Medical & Clinical</h3>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="p-occupation">Occupation</Label>
                      <Input
                        id="p-occupation"
                        placeholder="e.g. Software Engineer, Teacher"
                        value={patientForm.occupation}
                        onChange={(e) => setPatientForm({ ...patientForm, occupation: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="p-height">Height</Label>
                      <Input
                        id="p-height"
                        placeholder="e.g. 5ft 6in"
                        value={patientForm.height}
                        onChange={(e) => setPatientForm({ ...patientForm, height: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="p-dentition">Tooth Chart Type</Label>
                      <select
                        id="p-dentition"
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={patientForm.dentition_type}
                        onChange={(e) =>
                          setPatientForm({
                            ...patientForm,
                            dentition_type: e.target.value as "adult" | "child",
                          })
                        }
                      >
                        <option value="adult">Adult</option>
                        <option value="child">Child</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label className="text-xs font-medium text-foreground">Medical History</Label>
                    <div className="flex flex-wrap gap-2">
                      {MEDICAL_HISTORY_TOGGLES.map(({ key, label }) => {
                        const active = !!patientForm.medical_history[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              setPatientForm((prev) => ({
                                ...prev,
                                medical_history: {
                                  ...prev.medical_history,
                                  [key]: !prev.medical_history[key],
                                },
                              }))
                            }
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none",
                              active
                                ? key === "allergies"
                                  ? "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400 font-semibold ring-1 ring-red-500/30"
                                  : "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30"
                                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                active
                                  ? key === "allergies"
                                    ? "bg-red-600 dark:bg-red-400"
                                    : "bg-primary"
                                  : "bg-muted-foreground/40"
                              )}
                            />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {patientForm.medical_history.allergies && (
                    <div className="flex flex-col gap-1.5 animate-in fade-in-50 duration-200">
                      <Label htmlFor="p-allergies-detail" className="text-xs font-medium text-red-600 dark:text-red-400">
                        Allergy Details
                      </Label>
                      <Input
                        id="p-allergies-detail"
                        placeholder="e.g. Penicillin, NSAIDs, Latex..."
                        value={patientForm.medical_history.allergies_detail || ""}
                        onChange={(e) =>
                          setPatientForm((prev) => ({
                            ...prev,
                            medical_history: {
                              ...prev.medical_history,
                              allergies_detail: e.target.value,
                            },
                          }))
                        }
                        className="border-red-300 dark:border-red-900/50 focus-visible:ring-red-500"
                      />
                    </div>
                  )}

                  {patientForm.medical_history.other && (
                    <div className="flex flex-col gap-1.5 animate-in fade-in-50 duration-200">
                      <Label htmlFor="p-other-text" className="text-xs font-medium">
                        Other Details
                      </Label>
                      <Input
                        id="p-other-text"
                        placeholder="Specify other medical conditions..."
                        value={patientForm.medical_history.other_text || ""}
                        onChange={(e) =>
                          setPatientForm((prev) => ({
                            ...prev,
                            medical_history: {
                              ...prev.medical_history,
                              other_text: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Optional Queue Placement (New Patients Only on Step 2) */}
                {!editingPatient && (
                  <>
                    <div className="flex items-start gap-2.5 pt-3 border-t border-border">
                      <input
                        id="p-add-to-queue"
                        type="checkbox"
                        checked={addToTodayQueue}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAddToTodayQueue(checked);
                          if (!checked) {
                            setQueueWeight("");
                            setQueueBloodPressure("");
                            setQueueSpo2("");
                            setQueueChiefComplaint("");
                            setQueuePastDentalHistory("");
                          }
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                      />
                      <div className="flex flex-col gap-0.5">
                        <Label htmlFor="p-add-to-queue" className="text-xs font-medium cursor-pointer">
                          Add to today's in-clinic queue
                        </Label>
                        <span className="text-[11px] text-muted-foreground">
                          Doctor will see this patient in Today's queue right away.
                        </span>
                      </div>
                    </div>

                    {/* Vitals Sub-Section: only rendered when addToTodayQueue is CHECKED */}
                    {addToTodayQueue && (
                      <div className="space-y-3 pt-3 border-t border-border animate-in fade-in-50 duration-200">
                        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                          <Activity className="h-3.5 w-3.5 text-primary" />
                          <span>Today's Check-in Vitals & History (Optional)</span>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="p-weight" className="text-xs">Weight</Label>
                            <Input
                              id="p-weight"
                              placeholder="e.g. 68 kg"
                              value={queueWeight}
                              onChange={(e) => setQueueWeight(e.target.value)}
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="p-bp" className="text-xs">Blood Pressure</Label>
                            <Input
                              id="p-bp"
                              placeholder="e.g. 120/80 mmHg"
                              value={queueBloodPressure}
                              onChange={(e) => setQueueBloodPressure(e.target.value)}
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="p-spo2" className="text-xs">SpO2</Label>
                            <Input
                              id="p-spo2"
                              placeholder="e.g. 98%"
                              value={queueSpo2}
                              onChange={(e) => setQueueSpo2(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="p-chief-complaint" className="text-xs">Chief Complaint</Label>
                          <textarea
                            id="p-chief-complaint"
                            rows={2}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                            placeholder="Patient's primary concern or symptoms (e.g. Severe toothache lower right molar)"
                            value={queueChiefComplaint}
                            onChange={(e) => setQueueChiefComplaint(e.target.value)}
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="p-past-dental" className="text-xs">Past Dental History</Label>
                          <textarea
                            id="p-past-dental"
                            rows={2}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                            placeholder="Prior dental treatments, restorations, extractions, or complications"
                            value={queuePastDentalHistory}
                            onChange={(e) => setQueuePastDentalHistory(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <DialogFooter className="border-t border-border pt-3">
            {editingPatient ? (
              <>
                <Button type="button" variant="outline" onClick={() => setPatientModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </>
            ) : patientModalStep === 1 ? (
              <>
                <Button type="button" variant="outline" onClick={() => setPatientModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleNextStep}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setPatientModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="outline" onClick={() => setPatientModalStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button type="submit">Create Patient</Button>
              </>
            )}
          </DialogFooter>
        </form>
      </Dialog>

      {/* Add Payment Modal for Selected Patient */}
      {selectedPatient && (
        <AddPaymentModal
          open={addPaymentOpen}
          onOpenChange={setAddPaymentOpen}
          patientId={selectedPatient.id}
          patientName={selectedPatient.name}
          clinicId={selectedPatient.clinic_id}
          branchId={selectedPatient.branch_id}
          onSuccess={() => {
            loadBillingData(selectedPatient.id);
            loadPatientsData();
          }}
        />
      )}
    </div>
  );
}
