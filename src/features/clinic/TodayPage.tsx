import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Phone,
  Send,
  Clock,
  XCircle,
  AlertCircle,
  BarChart2,
  Calendar,
  MessageSquare,
  Pause,
  Play,
  Loader2,
  UserCheck,
  ArrowRight,
  ExternalLink,
  CreditCard,
  Users,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import {
  sendRecallNow,
  fetchTodayDaySheet,
  createWalkIn,
  updateAppointmentStatus,
  createPatient,
  DEFAULT_MEDICAL_HISTORY,
  type DaySheetEntry,
} from "@/lib/clinic-api";
import { todayIST, daysUntilIST, formatDateIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AddPaymentModal } from "@/features/clinic/billing/AddPaymentModal";
import { ActiveRecallsPopover } from "@/components/clinic/ActiveRecallsPopover";
import { cn } from "@/lib/utils";

type RecallRow = Database["public"]["Tables"]["recalls"]["Row"];
type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type BranchRow = Database["public"]["Tables"]["branches"]["Row"];
type VisitRow = Database["public"]["Tables"]["visits"]["Row"];
type TreatmentTypeRow = Database["public"]["Tables"]["treatment_types"]["Row"];

interface JoinedRecall extends RecallRow {
  patient?: PatientRow | null;
  visit?: (VisitRow & { treatment_type?: TreatmentTypeRow | null }) | null;
}

function formatTimeIST(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

export function TodayPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const navigate = useNavigate();

  // Active top-level Tab ("in_clinic" | "recalls") -- default "in_clinic" per Task 1
  const [activeTab, setActiveTab] = useState<string>("in_clinic");

  // ---- Day Sheet ("In Clinic") State ----
  const [daySheet, setDaySheet] = useState<DaySheetEntry[]>([]);
  const [daySheetLoading, setDaySheetLoading] = useState(true);
  const [daySheetError, setDaySheetError] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  // ---- Recalls State ----
  const [recalls, setRecalls] = useState<JoinedRecall[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [visitsThisMonth, setVisitsThisMonth] = useState<number>(0);
  const [sentTodayCount, setSentTodayCount] = useState<number>(0);
  const [recallsLoading, setRecallsLoading] = useState(true);
  const [recallsError, setRecallsError] = useState<string | null>(null);

  // Recalls Filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("pending_due");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentPatient, setPaymentPatient] = useState<{ id: string; name: string; branch_id: string } | null>(null);

  // Walk-in Modal State
  const [walkInModalOpen, setWalkInModalOpen] = useState(false);
  const [walkInSearch, setWalkInSearch] = useState("");
  const [selectedWalkInPatientId, setSelectedWalkInPatientId] = useState("");
  const [isNewWalkInPatient, setIsNewWalkInPatient] = useState(false);
  const [newWalkInName, setNewWalkInName] = useState("");
  const [newWalkInMobile, setNewWalkInMobile] = useState("");
  const [newWalkInAge, setNewWalkInAge] = useState("");
  const [newWalkInGender, setNewWalkInGender] = useState<"male" | "female" | "other">("male");
  const [walkInBranchId, setWalkInBranchId] = useState("");
  const [submittingWalkIn, setSubmittingWalkIn] = useState(false);
  const [walkInError, setWalkInError] = useState<string | null>(null);
  const [allPatients, setAllPatients] = useState<PatientRow[]>([]);

  // Recalls tab "+ Add Visit" patient picker (Phase 15A -- retires AddVisitModal). Same
  // search-existing-or-create-inline pattern as the walk-in picker above (reuses allPatients),
  // just followed by a navigate() into ConsultationPage instead of an in-place visit form.
  const [addVisitPickerOpen, setAddVisitPickerOpen] = useState(false);
  const [addVisitPatientSearch, setAddVisitPatientSearch] = useState("");
  const [selectedAddVisitPatientId, setSelectedAddVisitPatientId] = useState("");
  const [isNewAddVisitPatient, setIsNewAddVisitPatient] = useState(false);
  const [newAddVisitName, setNewAddVisitName] = useState("");
  const [newAddVisitMobile, setNewAddVisitMobile] = useState("");
  const [newAddVisitAge, setNewAddVisitAge] = useState("");
  const [newAddVisitGender, setNewAddVisitGender] = useState<"male" | "female" | "other">("male");
  const [addVisitBranchId, setAddVisitBranchId] = useState("");
  const [submittingAddVisitPicker, setSubmittingAddVisitPicker] = useState(false);
  const [addVisitPickerError, setAddVisitPickerError] = useState<string | null>(null);

  // Owner-only manual "Send Now" trigger
  const [sendingNowId, setSendingNowId] = useState<string | null>(null);

  useEffect(() => {
    loadTodayData();
    loadDaySheetData();
  }, []);

  async function loadDaySheetData() {
    setDaySheetLoading(true);
    setDaySheetError(null);
    const res = await fetchTodayDaySheet();
    if (res.ok) {
      setDaySheet(res.data);
    } else {
      setDaySheetError(res.error);
    }
    setDaySheetLoading(false);
  }

  async function loadTodayData() {
    setRecallsLoading(true);
    setRecallsError(null);

    const todayStr = todayIST();
    const firstDayOfMonth = `${todayStr.substring(0, 7)}-01`;

    const [rRes, bRes, vRes, mRes] = await Promise.all([
      supabase
        .from("recalls")
        .select("*, patient:patients(*), visit:visits(*, treatment_type:treatment_types(*))")
        .order("due_date", { ascending: true }),
      supabase.from("branches").select("*").eq("is_active", true),
      supabase.from("visits").select("id", { count: "exact" }).gte("visit_date", firstDayOfMonth),
      supabase
        .from("message_log")
        .select("id", { count: "exact" })
        .eq("is_test", false)
        .gte("created_at", `${todayStr}T00:00:00`),
    ]);

    if (rRes.error) {
      setRecallsError(rRes.error.message);
      setRecallsLoading(false);
      return;
    }

    setRecalls((rRes.data as JoinedRecall[]) || []);
    if (bRes.data) {
      setBranches(bRes.data);
      if (bRes.data.length > 0 && !walkInBranchId) {
        setWalkInBranchId(profile?.branch_id || bRes.data[0].id);
      }
    }
    if (vRes.count !== null) setVisitsThisMonth(vRes.count);
    if (mRes.count !== null) setSentTodayCount(mRes.count);

    setRecallsLoading(false);
  }

  async function openWalkInModal() {
    setWalkInError(null);
    setSelectedWalkInPatientId("");
    setIsNewWalkInPatient(false);
    setNewWalkInName("");
    setNewWalkInMobile("");
    setNewWalkInAge("");
    setNewWalkInGender("male");
    setWalkInSearch("");
    setWalkInBranchId(profile?.branch_id || (branches.length > 0 ? branches[0].id : ""));
    setWalkInModalOpen(true);

    const { data: pData } = await supabase.from("patients").select("*").eq("is_active", true).order("name");
    if (pData) setAllPatients(pData);
  }

  const filteredWalkInPatients = useMemo(() => {
    if (!walkInSearch.trim()) return allPatients.slice(0, 50);
    const q = walkInSearch.toLowerCase().trim();
    return allPatients
      .filter((p) => p.name.toLowerCase().includes(q) || p.mobile.includes(q))
      .slice(0, 50);
  }, [allPatients, walkInSearch]);

  async function handleConfirmWalkIn(e: React.FormEvent) {
    e.preventDefault();
    setWalkInError(null);
    setSubmittingWalkIn(true);

    if (!profile?.clinic_id) {
      setWalkInError("Clinic profile not loaded.");
      setSubmittingWalkIn(false);
      return;
    }

    const activeBranchId =
      profile.role === "owner" && branches.length > 1 && walkInBranchId
        ? walkInBranchId
        : profile.branch_id || (branches.length > 0 ? branches[0].id : "");

    if (!activeBranchId) {
      setWalkInError("Branch could not be determined.");
      setSubmittingWalkIn(false);
      return;
    }

    let finalPatientId = selectedWalkInPatientId;

    if (isNewWalkInPatient) {
      if (!newWalkInName.trim()) {
        setWalkInError("Patient full name is required.");
        setSubmittingWalkIn(false);
        return;
      }
      const cleanMob = newWalkInMobile.replace(/\D/g, "");
      if (cleanMob.length !== 10) {
        setWalkInError("Please enter a valid 10-digit mobile number.");
        setSubmittingWalkIn(false);
        return;
      }

      const patientRes = await createPatient({
        clinic_id: profile.clinic_id,
        branch_id: activeBranchId,
        name: newWalkInName.trim(),
        mobile: cleanMob,
        age: newWalkInAge ? parseInt(newWalkInAge, 10) : null,
        gender: newWalkInGender || null,
        address: null,
        notes: null,
        occupation: null,
        height: null,
        medical_history: DEFAULT_MEDICAL_HISTORY,
      });

      if (!patientRes.ok) {
        setWalkInError(patientRes.error);
        setSubmittingWalkIn(false);
        return;
      }

      finalPatientId = patientRes.data.id;
    } else {
      if (!finalPatientId) {
        setWalkInError("Please select a patient or add a new patient.");
        setSubmittingWalkIn(false);
        return;
      }
    }

    const walkInRes = await createWalkIn({
      clinic_id: profile.clinic_id,
      branch_id: activeBranchId,
      patient_id: finalPatientId,
    });

    if (!walkInRes.ok) {
      setWalkInError(walkInRes.error);
      setSubmittingWalkIn(false);
      return;
    }

    success("Walk-in patient checked in successfully.");
    setSubmittingWalkIn(false);
    setWalkInModalOpen(false);
    loadDaySheetData();
  }

  async function openAddVisitPatientPicker() {
    setAddVisitPickerError(null);
    setSelectedAddVisitPatientId("");
    setIsNewAddVisitPatient(false);
    setNewAddVisitName("");
    setNewAddVisitMobile("");
    setNewAddVisitAge("");
    setNewAddVisitGender("male");
    setAddVisitPatientSearch("");
    setAddVisitBranchId(profile?.branch_id || (branches.length > 0 ? branches[0].id : ""));
    setAddVisitPickerOpen(true);

    const { data: pData } = await supabase.from("patients").select("*").eq("is_active", true).order("name");
    if (pData) setAllPatients(pData);
  }

  const filteredAddVisitPatients = useMemo(() => {
    if (!addVisitPatientSearch.trim()) return allPatients.slice(0, 50);
    const q = addVisitPatientSearch.toLowerCase().trim();
    return allPatients
      .filter((p) => p.name.toLowerCase().includes(q) || p.mobile.includes(q))
      .slice(0, 50);
  }, [allPatients, addVisitPatientSearch]);

  /** Resolves a patient (existing or created inline) then navigates into ConsultationPage's
   * normal new-visit mode (no ?visitId=) -- this dialog only ever picks a patient, it never
   * creates the visit itself (that's ConsultationPage's job, same as PatientsPage's "Record
   * Visit" button). */
  async function handleConfirmAddVisitPicker(e: React.FormEvent) {
    e.preventDefault();
    setAddVisitPickerError(null);

    if (isNewAddVisitPatient) {
      if (!profile?.clinic_id) {
        setAddVisitPickerError("Clinic profile not loaded.");
        return;
      }
      if (!newAddVisitName.trim()) {
        setAddVisitPickerError("Patient full name is required.");
        return;
      }
      const cleanMob = newAddVisitMobile.replace(/\D/g, "");
      if (cleanMob.length !== 10) {
        setAddVisitPickerError("Please enter a valid 10-digit mobile number.");
        return;
      }
      const targetBranchId =
        profile.role === "receptionist" ? profile.branch_id : addVisitBranchId;
      if (!targetBranchId) {
        setAddVisitPickerError("Please select a branch for the new patient.");
        return;
      }

      setSubmittingAddVisitPicker(true);
      const patientRes = await createPatient({
        clinic_id: profile.clinic_id,
        branch_id: targetBranchId,
        name: newAddVisitName.trim(),
        mobile: cleanMob,
        age: newAddVisitAge ? parseInt(newAddVisitAge, 10) : null,
        gender: newAddVisitGender || null,
        address: null,
        notes: null,
        occupation: null,
        height: null,
        medical_history: DEFAULT_MEDICAL_HISTORY,
      });
      setSubmittingAddVisitPicker(false);

      if (!patientRes.ok) {
        setAddVisitPickerError(patientRes.error);
        return;
      }
      setAddVisitPickerOpen(false);
      navigate(`/app/patients/${patientRes.data.id}/consultation`);
      return;
    }

    if (!selectedAddVisitPatientId) {
      setAddVisitPickerError("Please select a patient or add a new patient.");
      return;
    }
    setAddVisitPickerOpen(false);
    navigate(`/app/patients/${selectedAddVisitPatientId}/consultation`);
  }

  // Action button handlers for DaySheet entries (Task 2)
  async function handleStartConsultation(entry: DaySheetEntry) {
    setUpdatingStatusId(entry.appointment_id);
    const res = await updateAppointmentStatus(entry.appointment_id, "in_chair");
    setUpdatingStatusId(null);

    if (!res.ok) {
      toastError(res.error, "Failed to start consultation");
      return;
    }
    navigate(`/app/patients/${entry.patient_id}/consultation`);
  }

  function handleOpenConsultation(entry: DaySheetEntry) {
    navigate(`/app/patients/${entry.patient_id}/consultation`);
  }

  function handleOpenPayment(entry: DaySheetEntry) {
    const patientBranch = profile?.branch_id || (branches.length > 0 ? branches[0].id : "");
    setPaymentPatient({
      id: entry.patient_id,
      name: entry.patient_name,
      branch_id: patientBranch,
    });
    setPaymentModalOpen(true);
  }

  const todayStr = todayIST();

  // Metrics calculation for Recalls
  const overdueCount = recalls.filter(
    (r) => (r.status === "pending" || r.status === "failed") && r.due_date < todayStr
  ).length;

  const dueTodayCount = recalls.filter(
    (r) => r.status === "pending" && r.due_date === todayStr
  ).length;

  const repliesWaitingRecalls = recalls.filter(
    (r) => r.reply_received_at && (!r.reply_dismissed_at || r.reply_dismissed_at < r.reply_received_at)
  );
  const repliesWaitingCount = repliesWaitingRecalls.length;

  // Monthly stats calculation for Recalls
  const firstDayOfMonth = `${todayStr.substring(0, 7)}-01`;
  const recallsThisMonth = recalls.filter((r) => r.due_date >= firstDayOfMonth);
  const dueThisMonthCount = recallsThisMonth.length;
  const sentThisMonthCount = recallsThisMonth.filter((r) => r.status === "sent" || r.attempt_count > 0).length;
  const bookedThisMonthCount = recallsThisMonth.filter((r) => r.status === "booked" || r.status === "completed").length;

  // Day Sheet counts
  const waitingCount = daySheet.filter((d) => d.status === "waiting").length;
  const inChairCount = daySheet.filter((d) => d.status === "in_chair").length;
  const doneCount = daySheet.filter((d) => d.status === "done").length;
  const paymentDueCount = daySheet.filter((d) => d.payment_due).length;

  // Row Action Handlers for Recalls
  async function handleMarkAsSent(r: JoinedRecall) {
    const nextAttempts = (r.attempt_count || 0) + 1;
    const nowIso = new Date().toISOString();

    const { error: err } = await supabase
      .from("recalls")
      .update({
        status: "sent",
        attempt_count: nextAttempts,
        last_attempt_at: nowIso,
      })
      .eq("id", r.id);

    if (err) {
      toastError(err.message, "Action Failed");
      return;
    }

    success("Recall marked as sent.");
    loadTodayData();
  }

  async function handleSnooze7Days(r: JoinedRecall) {
    const dt = new Date(`${r.due_date}T00:00:00+05:30`);
    dt.setDate(dt.getDate() + 7);
    const newDueDate = dt.toISOString().split("T")[0];

    const updates: Database["public"]["Tables"]["recalls"]["Update"] = { due_date: newDueDate };
    if (r.status === "contacted") {
      updates.status = "pending";
    }

    const { error: err } = await supabase
      .from("recalls")
      .update(updates)
      .eq("id", r.id);

    if (err) {
      toastError(err.message, "Snooze Failed");
      return;
    }

    success(`Recall snoozed to ${formatDateIST(newDueDate)}.`);
    loadTodayData();
  }

  async function handleDismissReply(r: JoinedRecall) {
    const { error: err } = await supabase
      .from("recalls")
      .update({ reply_dismissed_at: new Date().toISOString() })
      .eq("id", r.id);

    if (err) {
      toastError(err.message, "Action Failed");
      return;
    }

    success("Reply dismissed.");
    loadTodayData();
  }

  async function handleMarkDeclined(r: JoinedRecall) {
    const { error: err } = await supabase
      .from("recalls")
      .update({ status: "declined" })
      .eq("id", r.id);

    if (err) {
      toastError(err.message, "Action Failed");
      return;
    }

    success("Recall marked as not interested.");
    loadTodayData();
  }

  async function handleSendNow(r: JoinedRecall) {
    setSendingNowId(r.id);
    const result = await sendRecallNow(r.id);
    setSendingNowId(null);

    if (!result.ok) {
      toastError(result.error, "Send Failed");
      return;
    }
    if (!result.data.success) {
      toastError(result.data.error_message || "Unknown error from Meta", `Send Failed (${result.data.error_code ?? "no code"})`);
      return;
    }

    success(`WhatsApp message sent to ${r.patient?.name || "patient"}.`);
    loadTodayData();
  }

  async function handleTogglePause(r: JoinedRecall) {
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
    loadTodayData();
  }

  // Filter Logic for Recalls
  const filteredRecalls = recalls.filter((r) => {
    if (profile?.role === "owner" && selectedBranchId !== "all") {
      if (r.branch_id !== selectedBranchId) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const pName = r.patient?.name?.toLowerCase() || "";
      const pMobile = r.patient?.mobile || "";
      if (!pName.includes(q) && !pMobile.includes(q)) return false;
    }

    if (statusFilter === "pending_due") {
      if (r.status === "completed" || r.status === "declined") return false;
    } else if (statusFilter !== "all") {
      if (r.status !== statusFilter) return false;
    }

    if (dateFilter === "overdue") {
      if (r.due_date >= todayStr) return false;
    } else if (dateFilter === "today") {
      if (r.due_date !== todayStr) return false;
    } else if (dateFilter === "next7") {
      const days = daysUntilIST(r.due_date);
      if (days < 0 || days > 7) return false;
    } else if (dateFilter === "this_month") {
      if (!r.due_date.startsWith(todayStr.substring(0, 7))) return false;
    }

    return true;
  });

  const patientActiveRecallsMap = recalls.reduce<Record<string, JoinedRecall[]>>((acc, r) => {
    if (r.patient_id && r.status !== "completed" && r.status !== "declined") {
      if (!acc[r.patient_id]) acc[r.patient_id] = [];
      acc[r.patient_id].push(r);
    }
    return acc;
  }, {});

  function getRecallRowBgClass(r: JoinedRecall) {
    if (r.status === "paused") {
      return "opacity-75 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-slate-100/50 dark:hover:bg-slate-900/50";
    }
    if (r.status === "booked") {
      return "bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/40";
    }
    if (r.status === "contacted") {
      return "bg-amber-50/70 dark:bg-amber-950/40 hover:bg-amber-100/70 dark:hover:bg-amber-900/50";
    }
    const days = daysUntilIST(r.due_date);
    if (days < 0 && (r.status === "pending" || r.status === "failed")) {
      return "bg-red-50/50 dark:bg-red-950/30 hover:bg-red-100/50 dark:hover:bg-red-900/40";
    }
    if (days === 0 && r.status === "pending") {
      return "bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100/50 dark:hover:bg-amber-900/40";
    }
    return "hover:bg-muted/40";
  }

  function getStatusPill(status: string) {
    switch (status) {
      case "waiting":
        return (
          <Badge
            variant="outline"
            className="border-amber-600/30 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 text-xs font-normal"
          >
            Waiting
          </Badge>
        );
      case "in_chair":
        return (
          <Badge
            variant="outline"
            className="border-teal-500/30 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 text-xs font-normal"
          >
            In Chair
          </Badge>
        );
      case "done":
        return (
          <Badge
            variant="outline"
            className="border-emerald-600/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-normal"
          >
            Done
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="capitalize text-xs font-normal">
            {status}
          </Badge>
        );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Tabs & Action Row (Task 1) */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">Today's Clinic Activity</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live in-clinic patient queue, walk-in management, and preventive recall tracking
            </p>
          </div>

          <div className="flex items-center gap-3">
            <TabsList className="h-9">
              <TabsTrigger value="in_clinic" className="flex items-center gap-1.5 px-3.5 text-xs">
                <UserCheck className="h-3.5 w-3.5 text-primary" />
                In Clinic
                {daySheet.length > 0 && (
                  <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1.5 font-normal">
                    {daySheet.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="recalls" className="flex items-center gap-1.5 px-3.5 text-xs">
                <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                Recalls
                {dueTodayCount > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-1 text-[10px] py-0 px-1.5 font-normal border-amber-600/30 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40"
                  >
                    {dueTodayCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {activeTab === "in_clinic" ? (
              <Button size="sm" onClick={openWalkInModal} className="shadow-sm h-9">
                <Plus className="h-4 w-4 mr-1.5" />
                + Walk-in
              </Button>
            ) : (
              <Button size="sm" onClick={openAddVisitPatientPicker} className="shadow-sm h-9">
                <Plus className="h-4 w-4 mr-1.5" />
                + Add Visit
              </Button>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: IN CLINIC (DAY-SHEET QUEUE) */}
        {/* ========================================================================= */}
        <TabsContent value="in_clinic" className="mt-2 space-y-6">
          {daySheetError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{daySheetError}</span>
            </div>
          )}

          {/* Quick Metrics Strip */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-normal text-muted-foreground">Total In Clinic</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="text-2xl font-semibold text-foreground">
                  {daySheetLoading ? <Skeleton className="h-8 w-10" /> : daySheet.length}
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-normal text-muted-foreground">Waiting</CardTitle>
                <Clock className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="text-2xl font-semibold text-amber-700 dark:text-amber-400">
                  {daySheetLoading ? <Skeleton className="h-8 w-10" /> : waitingCount}
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-normal text-muted-foreground">In Chair</CardTitle>
                <UserCheck className="h-4 w-4 text-teal-600" />
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="text-2xl font-semibold text-teal-600 dark:text-teal-400">
                  {daySheetLoading ? <Skeleton className="h-8 w-10" /> : inChairCount}
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-normal text-muted-foreground">Done</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                  {daySheetLoading ? <Skeleton className="h-8 w-10" /> : doneCount}
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-normal text-muted-foreground">Payment Due</CardTitle>
                <CreditCard className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="text-2xl font-semibold text-destructive">
                  {daySheetLoading ? <Skeleton className="h-8 w-10" /> : paymentDueCount}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* In Clinic Day-Sheet Table */}
          <Card>
            <CardHeader className="pb-3 px-4 pt-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  Today's Patient Queue
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ordered chronologically by patient check-in time
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadDaySheetData} className="h-8 text-xs">
                Refresh Queue
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {daySheetLoading ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : daySheet.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <UserCheck className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No patients checked in yet today</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    When a patient arrives at the clinic, check them in as a walk-in to start their consultation.
                  </p>
                  <Button size="sm" className="mt-4 shadow-sm" onClick={openWalkInModal}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    + Walk-in Patient
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-y border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                      <tr>
                        <th className="py-3 px-4">Patient Name</th>
                        <th className="py-3 px-4">Age / Gender</th>
                        <th className="py-3 px-4">Mobile</th>
                        <th className="py-3 px-4">Check-in</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Payment</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {daySheet.map((entry) => (
                        <tr key={entry.appointment_id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3.5 px-4 font-medium text-foreground">
                            <Link
                              to={`/app/patients?id=${entry.patient_id}`}
                              className="hover:underline text-foreground font-medium"
                            >
                              {entry.patient_name}
                            </Link>
                          </td>
                          <td className="py-3.5 px-4 text-muted-foreground capitalize text-xs">
                            {entry.patient_age ? `${entry.patient_age} yrs` : "—"} / {entry.patient_gender || "—"}
                          </td>
                          <td className="py-3.5 px-4 text-muted-foreground text-xs font-mono">
                            {entry.patient_mobile ? (
                              <a
                                href={`tel:${entry.patient_mobile}`}
                                className="inline-flex items-center gap-1 hover:text-primary"
                              >
                                <Phone className="h-3 w-3" />
                                {entry.patient_mobile}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-xs font-mono text-muted-foreground">
                            {formatTimeIST(entry.checked_in_at || entry.scheduled_at)}
                          </td>
                          <td className="py-3.5 px-4">{getStatusPill(entry.status)}</td>
                          <td className="py-3.5 px-4">
                            {entry.payment_due ? (
                              <Badge
                                variant="outline"
                                className="border-red-500/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 text-[11px] font-normal"
                              >
                                Payment Due
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {entry.status === "waiting" && (
                                <Button
                                  size="sm"
                                  onClick={() => handleStartConsultation(entry)}
                                  disabled={updatingStatusId === entry.appointment_id}
                                  className="h-8 px-3 text-xs shadow-sm"
                                >
                                  {updatingStatusId === entry.appointment_id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                  ) : (
                                    <ArrowRight className="h-3.5 w-3.5 mr-1" />
                                  )}
                                  Start
                                </Button>
                              )}
                              {entry.status === "in_chair" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenConsultation(entry)}
                                  className="h-8 px-3 text-xs border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                                >
                                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                  Open
                                </Button>
                              )}
                              {entry.status === "done" && entry.payment_due && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenPayment(entry)}
                                  className="h-8 px-2.5 text-xs border-amber-600/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                >
                                  <CreditCard className="h-3.5 w-3.5 mr-1" />
                                  Payment
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 2: RECALLS (PREVENTIVE CARE QUEUE) */}
        {/* ========================================================================= */}
        <TabsContent value="recalls" className="mt-2 space-y-6">
          {recallsError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {recallsError}
            </div>
          )}

          {/* Stat Cards Row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">Overdue</CardTitle>
                <AlertCircle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-destructive">
                  {recallsLoading ? <Skeleton className="h-8 w-10" /> : overdueCount}
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">Due Today</CardTitle>
                <Clock className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-amber-700">
                  {recallsLoading ? <Skeleton className="h-8 w-10" /> : dueTodayCount}
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">Sent Today</CardTitle>
                <Send className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-foreground">
                  {recallsLoading ? <Skeleton className="h-8 w-10" /> : sentTodayCount}
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">Replies Waiting</CardTitle>
                <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-amber-700 dark:text-amber-400">
                  {recallsLoading ? <Skeleton className="h-8 w-10" /> : repliesWaitingCount}
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">Visits This Month</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-muted-foreground">
                  {recallsLoading ? <Skeleton className="h-8 w-10" /> : visitsThisMonth}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Summary Strip */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3.5 text-sm">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-primary" />
              <span className="font-medium text-foreground text-xs sm:text-sm">Monthly Summary</span>
              <Badge variant="outline" className="text-[10px] font-normal border-primary/30 text-primary bg-primary/5">
                This Month
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 text-center sm:text-left w-full sm:w-auto">
              <div>
                <span className="text-[11px] text-muted-foreground block">Recalls Due</span>
                <span className="font-medium text-foreground text-sm">{dueThisMonthCount}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Sent</span>
                <span className="font-medium text-foreground text-sm">{sentThisMonthCount}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Booked</span>
                <span className="font-medium text-foreground text-sm">{bookedThisMonthCount}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Visits Completed</span>
                <span className="font-medium text-foreground text-sm">{visitsThisMonth}</span>
              </div>
            </div>
          </div>

          {/* Pinned Replies Waiting Section */}
          {repliesWaitingRecalls.length > 0 && (
            <Card className="border-amber-600/30 bg-amber-50/30 dark:bg-amber-950/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <CardTitle className="text-sm font-medium text-foreground">
                      Replies Waiting Action ({repliesWaitingRecalls.length})
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="border-amber-600/30 text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/40 text-xs font-normal">
                    Action Required
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Patients who responded to WhatsApp recall messages and require follow-up scheduling
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-y border-amber-600/20 bg-amber-100/40 dark:bg-amber-950/40 text-[11px] font-medium text-muted-foreground uppercase">
                      <tr>
                        <th className="py-2.5 px-4">Patient Name</th>
                        <th className="py-2.5 px-4">Mobile</th>
                        <th className="py-2.5 px-4">Treatment</th>
                        <th className="py-2.5 px-4">Last Attempt</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-600/10">
                      {repliesWaitingRecalls.map((r) => {
                        const replyTextClean = r.notes ? r.notes.replace(/^Patient reply:\s*/i, "") : null;
                        return (
                          <tr key={r.id} className="hover:bg-amber-100/30 dark:hover:bg-amber-900/30 transition-colors">
                            <td className="py-3 px-4 font-medium text-foreground">
                              <Link to={`/app/patients?id=${r.patient_id}`} className="hover:underline font-medium block">
                                {r.patient?.name || "Unknown Patient"}
                              </Link>
                              {replyTextClean && (
                                <p className="text-xs font-normal text-amber-900/80 dark:text-amber-200/80 mt-0.5 line-clamp-1 max-w-xs" title={replyTextClean}>
                                  "{replyTextClean}"
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {r.patient?.mobile ? (
                                <a href={`tel:${r.patient.mobile}`} className="inline-flex items-center gap-1 hover:text-primary">
                                  <Phone className="h-3 w-3" />
                                  {r.patient.mobile}
                                </a>
                              ) : "—"}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {r.visit?.treatment_type?.name || "General Checkup"}
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              {r.last_attempt_at ? formatDateIST(r.last_attempt_at.split("T")[0]) : "—"}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => navigate(`/app/patients/${r.patient_id}/consultation`)}
                                  className="h-7 px-2.5 text-xs"
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Book Visit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSnooze7Days(r)}
                                  className="h-7 px-2 text-xs"
                                >
                                  <Clock className="h-3 w-3 mr-1" />
                                  Snooze (+7d)
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Dismiss this reply"
                                  onClick={() => handleDismissReply(r)}
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg border border-border">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by patient name or mobile..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {profile?.role === "owner" && branches.length > 0 && (
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                >
                  <option value="all">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      Branch: {b.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              >
                <option value="all">All Dates</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due Today</option>
                <option value="next7">Next 7 Days</option>
                <option value="this_month">This Month</option>
              </select>

              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="pending_due">Active Recalls (Excl. Completed/Declined)</option>
                <option value="pending">Pending</option>
                <option value="sent">Sent</option>
                <option value="paused">Paused</option>
                <option value="booked">Booked</option>
                <option value="completed">Completed</option>
                <option value="declined">Declined</option>
                <option value="all">All Statuses</option>
              </select>
            </div>
          </div>

          {/* Recall Queue Table */}
          <Card>
            <CardContent className="p-0">
              {recallsLoading ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : filteredRecalls.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <p className="text-sm text-muted-foreground">No recalls in queue matching your filters.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={openAddVisitPatientPicker}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    + Add Visit
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                      <tr>
                        <th className="py-3 px-4">Patient Name</th>
                        <th className="py-3 px-4">Mobile</th>
                        <th className="py-3 px-4">Last Treatment</th>
                        <th className="py-3 px-4">Due Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-center">Attempts</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredRecalls.map((r) => {
                        const days = daysUntilIST(r.due_date);
                        const activeRecallsForPatient = r.patient_id ? patientActiveRecallsMap[r.patient_id] || [] : [];
                        const activeCount = activeRecallsForPatient.length;
                        const isPaused = r.status === "paused";

                        return (
                          <tr key={r.id} className={cn("transition-colors", getRecallRowBgClass(r))}>
                            <td className="py-3 px-4 font-medium text-foreground">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  to={`/app/patients?id=${r.patient_id}`}
                                  className="hover:underline text-foreground"
                                >
                                  {r.patient?.name || "Unknown Patient"}
                                </Link>
                                {activeCount > 1 && (
                                  <ActiveRecallsPopover
                                    patientName={r.patient?.name || "Patient"}
                                    recalls={activeRecallsForPatient}
                                    onTogglePause={handleTogglePause}
                                  >
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] py-0 px-1.5 font-normal border-muted-foreground/30 text-muted-foreground bg-muted/30 hover:bg-muted/60 transition-colors"
                                    >
                                      {activeCount} active recalls
                                    </Badge>
                                  </ActiveRecallsPopover>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {r.patient?.mobile ? (
                                <a
                                  href={`tel:${r.patient.mobile}`}
                                  className="inline-flex items-center gap-1 hover:text-primary"
                                >
                                  <Phone className="h-3 w-3" />
                                  {r.patient.mobile}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {r.visit?.treatment_type?.name || "General Checkup"}
                            </td>
                            <td className="py-3 px-4 text-foreground font-medium">
                              {formatDateIST(r.due_date)}
                              {days < 0 && (
                                <span className="ml-1.5 text-xs text-destructive font-normal">
                                  ({Math.abs(days)}d overdue)
                                </span>
                              )}
                              {days === 0 && (
                                <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-400 font-normal">
                                  (Today)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "capitalize font-normal text-xs",
                                  r.status === "pending" && days < 0 && "border-destructive/30 text-destructive bg-destructive/10",
                                  r.status === "pending" && days === 0 && "border-amber-600/30 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40",
                                  r.status === "sent" && "border-primary/30 text-primary bg-primary/5 dark:bg-primary/10",
                                  r.status === "booked" && "border-emerald-600/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
                                  r.status === "contacted" && "border-amber-600/30 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40",
                                  r.status === "declined" && "border-muted text-muted-foreground bg-muted/20",
                                  r.status === "paused" && "border-slate-500/30 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/40"
                                )}
                              >
                                {r.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-center text-muted-foreground">
                              {r.attempt_count}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {isPaused ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Resume Recall"
                                    onClick={() => handleTogglePause(r)}
                                    className="h-8 px-2 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                  >
                                    <Play className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                                    Resume
                                  </Button>
                                ) : (
                                  <>
                                    {profile?.role === "owner" && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        title="Send WhatsApp message now (bypasses the scheduled send time)"
                                        onClick={() => handleSendNow(r)}
                                        disabled={sendingNowId === r.id}
                                        className="h-8 px-2 text-xs text-primary hover:bg-primary/10"
                                      >
                                        {sendingNowId === r.id ? (
                                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                        ) : (
                                          <Send className="h-3.5 w-3.5 mr-1" />
                                        )}
                                        Send Now
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Mark as Sent"
                                      onClick={() => handleMarkAsSent(r)}
                                      className="h-8 px-2 text-xs"
                                    >
                                      <Send className="h-3.5 w-3.5 mr-1" />
                                      Sent
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Snooze 7 Days"
                                      onClick={() => handleSnooze7Days(r)}
                                      className="h-8 px-2 text-xs"
                                    >
                                      <Clock className="h-3.5 w-3.5 mr-1" />
                                      +7d
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Pause Recall"
                                      onClick={() => handleTogglePause(r)}
                                      className="h-8 px-2 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                    >
                                      <Pause className="h-3.5 w-3.5 mr-1 text-amber-600" />
                                      Pause
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Not Interested"
                                      onClick={() => handleMarkDeclined(r)}
                                      className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
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
        </TabsContent>
      </Tabs>

      {/* ========================================================================= */}
      {/* MODAL: + WALK-IN PATIENT (Task 3) */}
      {/* ========================================================================= */}
      <Dialog open={walkInModalOpen} onOpenChange={setWalkInModalOpen}>
        <form onSubmit={handleConfirmWalkIn}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Check In Walk-in Patient
            </DialogTitle>
            <DialogDescription>
              Add a patient to today's in-clinic queue with status "Waiting".
            </DialogDescription>
          </DialogHeader>

          {walkInError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{walkInError}</span>
            </div>
          )}

          <div className="flex flex-col gap-4 py-4 max-h-[65vh] overflow-y-auto px-1">
            {/* Toggle Existing Patient vs New Patient */}
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-foreground">Patient *</Label>
                <button
                  type="button"
                  onClick={() => {
                    setIsNewWalkInPatient(!isNewWalkInPatient);
                    setWalkInError(null);
                  }}
                  className="text-xs text-primary underline underline-offset-2 font-medium cursor-pointer"
                >
                  {isNewWalkInPatient ? "Select Existing Patient" : "+ New Patient Inline"}
                </button>
              </div>

              {isNewWalkInPatient ? (
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label htmlFor="wi-name" className="text-xs">Full Name *</Label>
                    <Input
                      id="wi-name"
                      placeholder="e.g. Rahul Sharma"
                      value={newWalkInName}
                      onChange={(e) => setNewWalkInName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="wi-mob" className="text-xs">10-digit Mobile *</Label>
                    <Input
                      id="wi-mob"
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      value={newWalkInMobile}
                      onChange={(e) => setNewWalkInMobile(e.target.value.replace(/\D/g, ""))}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="wi-age" className="text-xs">Age</Label>
                    <Input
                      id="wi-age"
                      type="number"
                      min="1"
                      max="120"
                      placeholder="e.g. 28"
                      value={newWalkInAge}
                      onChange={(e) => setNewWalkInAge(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label htmlFor="wi-gender" className="text-xs">Gender</Label>
                    <select
                      id="wi-gender"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring capitalize"
                      value={newWalkInGender}
                      onChange={(e) => setNewWalkInGender(e.target.value as "male" | "female" | "other")}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search patient by name or mobile..."
                      value={walkInSearch}
                      onChange={(e) => setWalkInSearch(e.target.value)}
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={selectedWalkInPatientId}
                    onChange={(e) => setSelectedWalkInPatientId(e.target.value)}
                    required
                  >
                    <option value="">-- Select Patient --</option>
                    {filteredWalkInPatients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.mobile})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Branch Selector (Owners with multiple branches only) */}
            {profile?.role === "owner" && branches.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wi-branch" className="text-xs">Branch *</Label>
                <select
                  id="wi-branch"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={walkInBranchId}
                  onChange={(e) => setWalkInBranchId(e.target.value)}
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
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setWalkInModalOpen(false)}
              disabled={submittingWalkIn}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submittingWalkIn}>
              {submittingWalkIn ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserCheck className="h-4 w-4 mr-2" />
              )}
              Check In Patient
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* MODAL: + ADD VISIT patient picker (Recalls tab) -- retires AddVisitModal (Phase 15A).
         Only picks a patient; ConsultationPage (navigated to on confirm) creates the visit. */}
      <Dialog open={addVisitPickerOpen} onOpenChange={setAddVisitPickerOpen}>
        <form onSubmit={handleConfirmAddVisitPicker}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Add Visit
            </DialogTitle>
            <DialogDescription>
              Select the patient to record a visit for -- the consultation page opens next.
            </DialogDescription>
          </DialogHeader>

          {addVisitPickerError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{addVisitPickerError}</span>
            </div>
          )}

          <div className="flex flex-col gap-4 py-4 max-h-[65vh] overflow-y-auto px-1">
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-foreground">Patient *</Label>
                <button
                  type="button"
                  onClick={() => {
                    setIsNewAddVisitPatient(!isNewAddVisitPatient);
                    setAddVisitPickerError(null);
                  }}
                  className="text-xs text-primary underline underline-offset-2 font-medium cursor-pointer"
                >
                  {isNewAddVisitPatient ? "Select Existing Patient" : "+ New Patient Inline"}
                </button>
              </div>

              {isNewAddVisitPatient ? (
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label htmlFor="av-name" className="text-xs">Full Name *</Label>
                    <Input
                      id="av-name"
                      placeholder="e.g. Rahul Sharma"
                      value={newAddVisitName}
                      onChange={(e) => setNewAddVisitName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="av-mob" className="text-xs">10-digit Mobile *</Label>
                    <Input
                      id="av-mob"
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      value={newAddVisitMobile}
                      onChange={(e) => setNewAddVisitMobile(e.target.value.replace(/\D/g, ""))}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="av-age" className="text-xs">Age</Label>
                    <Input
                      id="av-age"
                      type="number"
                      min="1"
                      max="120"
                      placeholder="e.g. 28"
                      value={newAddVisitAge}
                      onChange={(e) => setNewAddVisitAge(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label htmlFor="av-gender" className="text-xs">Gender</Label>
                    <select
                      id="av-gender"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring capitalize"
                      value={newAddVisitGender}
                      onChange={(e) => setNewAddVisitGender(e.target.value as "male" | "female" | "other")}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search patient by name or mobile..."
                      value={addVisitPatientSearch}
                      onChange={(e) => setAddVisitPatientSearch(e.target.value)}
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={selectedAddVisitPatientId}
                    onChange={(e) => setSelectedAddVisitPatientId(e.target.value)}
                    required
                  >
                    <option value="">-- Select Patient --</option>
                    {filteredAddVisitPatients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.mobile})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Branch Selector (Owners with multiple branches only) -- new-inline-patient case only */}
            {isNewAddVisitPatient && profile?.role === "owner" && branches.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="av-branch" className="text-xs">Branch *</Label>
                <select
                  id="av-branch"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={addVisitBranchId}
                  onChange={(e) => setAddVisitBranchId(e.target.value)}
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
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddVisitPickerOpen(false)}
              disabled={submittingAddVisitPicker}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submittingAddVisitPicker}>
              {submittingAddVisitPicker ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Continue to Consultation
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Add Payment Modal (In Clinic tab "Payment" button) */}
      {paymentPatient && (
        <AddPaymentModal
          open={paymentModalOpen}
          onOpenChange={setPaymentModalOpen}
          patientId={paymentPatient.id}
          patientName={paymentPatient.name}
          clinicId={profile?.clinic_id || ""}
          branchId={paymentPatient.branch_id}
          onSuccess={() => {
            loadDaySheetData();
            loadTodayData();
          }}
        />
      )}
    </div>
  );
}
