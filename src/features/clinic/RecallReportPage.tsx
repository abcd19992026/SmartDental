import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  TrendingUp,
  Send,
  CheckCheck,
  MessageSquare,
  UserCheck,
  Receipt,
  IndianRupee,
  Info,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { supabase } from "@/lib/supabase";
import { fetchRecallReport, type RecallReportRow } from "@/lib/clinic-api";
import { todayIST, formatDateIST } from "@/lib/dates";
import { formatINR } from "@/lib/utils";
import type { Database } from "@/types/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type BranchRow = Database["public"]["Tables"]["branches"]["Row"];

function getMonthRange(yearMonth: string): { monthStart: string; monthEndExclusive: string } {
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    const now = todayIST().slice(0, 7);
    const [ny, nm] = now.split("-");
    return getMonthRange(`${ny}-${nm}`);
  }

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;

  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const monthEndExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  return { monthStart, monthEndExclusive };
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, "0");
  return `${ny}-${nm}`;
}

function formatMonthHeader(yearMonth: string): string {
  try {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  } catch {
    return yearMonth;
  }
}

function formatReportDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    if (dateStr.includes("T")) {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
    }
    return formatDateIST(dateStr);
  } catch {
    return dateStr;
  }
}

export function RecallReportPage() {
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";

  const [selectedMonth, setSelectedMonth] = useState<string>(() => todayIST().slice(0, 7));
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [branches, setBranches] = useState<BranchRow[]>([]);

  const [reportRows, setReportRows] = useState<RecallReportRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load branches once for multi-branch clinics
  useEffect(() => {
    async function loadBranches() {
      if (!isOwner) return;
      const { data } = await supabase.from("branches").select("*").eq("is_active", true).order("name");
      if (data) {
        setBranches(data);
      }
    }
    loadBranches();
  }, [isOwner]);

  // Fetch report on filter changes
  useEffect(() => {
    async function loadReport() {
      if (!isOwner) return;
      setLoading(true);
      setError(null);

      const { monthStart, monthEndExclusive } = getMonthRange(selectedMonth);
      const branchParam = selectedBranchId === "all" ? undefined : selectedBranchId;

      const res = await fetchRecallReport(monthStart, monthEndExclusive, branchParam);

      if (!res.ok) {
        setError(res.error);
        setReportRows([]);
      } else {
        setReportRows(res.data);
      }
      setLoading(false);
    }

    loadReport();
  }, [isOwner, selectedMonth, selectedBranchId]);

  // Aggregated Summary values
  const recallsSent = reportRows.filter((r) => r.first_sent_at !== null).length;
  const delivered = reportRows.filter((r) => r.delivered_at !== null).length;
  const replied = reportRows.filter((r) => r.reply_received_at !== null).length;
  const returned = reportRows.filter((r) => r.return_visit_id !== null).length;

  const totalBilled = reportRows.reduce((acc, r) => {
    return r.return_visit_amount !== null ? acc + r.return_visit_amount : acc;
  }, 0);

  const hasAnyCollected = reportRows.some((r) => r.collected_amount !== null);
  const totalCollected = reportRows.reduce((acc, r) => {
    return r.collected_amount !== null ? acc + r.collected_amount : acc;
  }, 0);
  const collectedDisplay = hasAnyCollected ? formatINR(totalCollected) : "—";

  // Drilldown rows (patients who returned)
  const returnedRows = reportRows.filter((r) => r.return_visit_id !== null);

  if (!isOwner) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Recall Report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Conversion tracking and return visit revenue attribution for scheduled recalls
          </p>
        </div>

        {/* Filters Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Branch Selector (owners with > 1 branch) */}
          {isOwner && branches.length > 1 && (
            <div className="flex items-center">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                aria-label="Filter by branch"
              >
                <option value="all">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    Branch: {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Month Picker with Quick Arrows */}
          <div className="flex items-center rounded-md border border-input bg-background overflow-hidden h-9 shadow-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2.5 rounded-none border-r border-input text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedMonth((prev) => shiftMonth(prev, -1))}
              title="Previous Month"
              aria-label="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              className="px-2.5 text-xs bg-transparent border-0 font-medium text-foreground focus:outline-none cursor-pointer"
              aria-label="Select report month"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2.5 rounded-none border-l border-input text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedMonth((prev) => shiftMonth(prev, 1))}
              title="Next Month"
              aria-label="Next Month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} size="sm">
                <CardHeader className="pb-1">
                  <Skeleton className="h-3 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-7 w-16 mt-1" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
          <Card>
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : reportRows.length === 0 ? (
        /* Empty State: Zero recalls sent in selected period */
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
              <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium text-foreground">No recalls were sent in this period yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              There are no recall messages recorded as sent for {formatMonthHeader(selectedMonth)}
              {selectedBranchId !== "all" ? " on the selected branch" : ""}.
            </p>
          </CardContent>
        </Card>
      ) : (
        /* Report Content */
        <div className="flex flex-col gap-6">
          {/* Summary Cards Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Recalls Sent */}
            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-normal text-muted-foreground">Recalls Sent</CardTitle>
                <Send className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">{recallsSent}</div>
              </CardContent>
            </Card>

            {/* Delivered */}
            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-normal text-muted-foreground">Delivered</CardTitle>
                <CheckCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">{delivered}</div>
              </CardContent>
            </Card>

            {/* Replied */}
            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-normal text-muted-foreground">Replied</CardTitle>
                <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">{replied}</div>
              </CardContent>
            </Card>

            {/* Returned */}
            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-normal text-muted-foreground">Returned</CardTitle>
                <UserCheck className="h-3.5 w-3.5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">{returned}</div>
              </CardContent>
            </Card>

            {/* Billed */}
            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-normal text-muted-foreground">Billed</CardTitle>
                <Receipt className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">{formatINR(totalBilled)}</div>
              </CardContent>
            </Card>

            {/* Collected */}
            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-normal text-muted-foreground">Collected</CardTitle>
                <IndianRupee className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">{collectedDisplay}</div>
              </CardContent>
            </Card>
          </div>

          {/* Honesty Note */}
          <div className="flex items-start sm:items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5 sm:mt-0" />
            <p>
              Ye &apos;wapas aaye&apos; recall ke baad hue visits hain -- ye zaroori nahi ki recall hi wajah thi, sirf itna pakka hai ki visit recall ke 45 din ke andar hui.
            </p>
          </div>

          {/* Drilldown Table */}
          <Card>
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium">Returned Patients Drilldown</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Individual patients with return visits credited within 45 days of their recall send
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs font-normal">
                  {returnedRows.length} {returnedRows.length === 1 ? "patient" : "patients"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {returnedRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <UserCheck className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm font-medium text-foreground">No return visits recorded yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    None of the {reportRows.length} patients with recalls sent in {formatMonthHeader(selectedMonth)} have a recorded visit within their 45-day window so far.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                      <tr>
                        <th className="py-3 px-4">Patient Name</th>
                        <th className="py-3 px-4">Recall Due Date</th>
                        <th className="py-3 px-4">Sent On</th>
                        <th className="py-3 px-4">Returned On</th>
                        <th className="py-3 px-4 text-right">Billed</th>
                        <th className="py-3 px-4 text-right">Collected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {returnedRows.map((r) => (
                        <tr key={r.recall_id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-medium text-foreground">
                            {r.patient_name || "—"}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {formatReportDate(r.due_date)}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {formatReportDate(r.first_sent_at)}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {formatReportDate(r.return_visit_date)}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-foreground">
                            {r.return_visit_amount !== null ? formatINR(r.return_visit_amount) : "—"}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-foreground">
                            {r.collected_amount !== null ? formatINR(r.collected_amount) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
