import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { todayIST, daysUntilIST, formatDateIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddVisitModal } from "@/features/clinic/AddVisitModal";
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

export function TodayPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();

  const [recalls, setRecalls] = useState<JoinedRecall[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [visitsThisMonth, setVisitsThisMonth] = useState<number>(0);
  const [sentTodayCount, setSentTodayCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("pending_due");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal State
  const [visitModalOpen, setVisitModalOpen] = useState(false);

  useEffect(() => {
    loadTodayData();
  }, []);

  async function loadTodayData() {
    setLoading(true);
    setError(null);

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
      setError(rRes.error.message);
      setLoading(false);
      return;
    }

    setRecalls((rRes.data as JoinedRecall[]) || []);
    if (bRes.data) setBranches(bRes.data);
    if (vRes.count !== null) setVisitsThisMonth(vRes.count);
    if (mRes.count !== null) setSentTodayCount(mRes.count);

    setLoading(false);
  }

  const todayStr = todayIST();

  // Metrics calculation
  const overdueCount = recalls.filter(
    (r) => (r.status === "pending" || r.status === "failed") && r.due_date < todayStr
  ).length;

  const dueTodayCount = recalls.filter(
    (r) => r.status === "pending" && r.due_date === todayStr
  ).length;

  // Replies waiting: recalls with status = 'contacted'
  const repliesWaitingRecalls = recalls.filter((r) => r.status === "contacted");
  const repliesWaitingCount = repliesWaitingRecalls.length;

  // Monthly stats calculation
  const firstDayOfMonth = `${todayStr.substring(0, 7)}-01`;
  const recallsThisMonth = recalls.filter((r) => r.due_date >= firstDayOfMonth);
  const dueThisMonthCount = recallsThisMonth.length;
  const sentThisMonthCount = recallsThisMonth.filter((r) => r.status === "sent" || r.attempt_count > 0).length;
  const bookedThisMonthCount = recallsThisMonth.filter((r) => r.status === "booked" || r.status === "completed").length;

  // Row Action Handlers
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

  // Filter Logic
  const filteredRecalls = recalls.filter((r) => {
    // Owner Branch Filter
    if (profile?.role === "owner" && selectedBranchId !== "all") {
      if (r.branch_id !== selectedBranchId) return false;
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const pName = r.patient?.name?.toLowerCase() || "";
      const pMobile = r.patient?.mobile || "";
      if (!pName.includes(q) && !pMobile.includes(q)) return false;
    }

    // Status Filter
    if (statusFilter === "pending_due") {
      if (r.status === "completed" || r.status === "declined") return false;
    } else if (statusFilter !== "all") {
      if (r.status !== statusFilter) return false;
    }

    // Date Filter
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

  // Group active recalls (non-completed, non-declined) per patient for popovers & counts
  const patientActiveRecallsMap = recalls.reduce<Record<string, JoinedRecall[]>>((acc, r) => {
    if (r.patient_id && r.status !== "completed" && r.status !== "declined") {
      if (!acc[r.patient_id]) acc[r.patient_id] = [];
      acc[r.patient_id].push(r);
    }
    return acc;
  }, {});

  function getRowBgClass(r: JoinedRecall) {
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header with single primary action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-foreground">Today's Recall Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor and action due patient recalls for preventive care
          </p>
        </div>
        <Button onClick={() => setVisitModalOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          + Add Visit
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
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
            <div className="text-2xl font-medium text-destructive">{loading ? <Skeleton className="h-8 w-10" /> : overdueCount}</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">Due Today</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium text-amber-700">{loading ? <Skeleton className="h-8 w-10" /> : dueTodayCount}</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">Sent Today</CardTitle>
            <Send className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium text-foreground">{loading ? <Skeleton className="h-8 w-10" /> : sentTodayCount}</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">Replies Waiting</CardTitle>
            <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium text-amber-700 dark:text-amber-400">{loading ? <Skeleton className="h-8 w-10" /> : repliesWaitingCount}</div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">Appointments Today</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium text-muted-foreground">0</div>
          </CardContent>
        </Card>
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
                              onClick={() => setVisitModalOpen(true)}
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
                              onClick={() => handleMarkDeclined(r)}
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
          {/* Branch Filter (Owners Only) */}
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

          {/* Date Filter */}
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

          {/* Status Filter */}
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
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredRecalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-sm text-muted-foreground">No recalls in queue matching your filters.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setVisitModalOpen(true)}>
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
                      <tr key={r.id} className={cn("transition-colors", getRowBgClass(r))}>
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

      {/* Bottom Compact Reporting Strip */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <BarChart2 className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">Monthly Summary:</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 text-center sm:text-left">
          <div>
            <span className="text-xs text-muted-foreground block">Recalls Due</span>
            <span className="font-medium text-foreground">{dueThisMonthCount}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Sent</span>
            <span className="font-medium text-foreground">{sentThisMonthCount}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Booked</span>
            <span className="font-medium text-foreground">{bookedThisMonthCount}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Visits Completed</span>
            <span className="font-medium text-foreground">{visitsThisMonth}</span>
          </div>
        </div>
      </div>

      {/* Add Visit Modal */}
      <AddVisitModal
        open={visitModalOpen}
        onOpenChange={setVisitModalOpen}
        onSuccess={loadTodayData}
      />
    </div>
  );
}
