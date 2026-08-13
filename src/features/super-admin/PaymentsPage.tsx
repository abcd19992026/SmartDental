import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getClinicsList, type ClinicListRow } from "@/lib/admin-api";
import { formatDateIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

interface JoinedPayment extends PaymentRow {
  clinic?: { name: string } | null;
}

export function PaymentsPage() {
  const [payments, setPayments] = useState<JoinedPayment[]>([]);
  const [clinics, setClinics] = useState<ClinicListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedClinicId, setSelectedClinicId] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const [pRes, cRes] = await Promise.all([
        supabase.from("payments").select("*, clinic:clinics(name)").order("paid_on", { ascending: false }),
        getClinicsList(),
      ]);

      if (pRes.error) {
        setError(pRes.error.message);
        setLoading(false);
        return;
      }

      setPayments(pRes.data as JoinedPayment[]);
      if (cRes.ok) setClinics(cRes.data);

      setLoading(false);
    }

    loadData();
  }, []);

  const filteredPayments = payments.filter((p) => {
    if (selectedClinicId !== "all" && p.clinic_id !== selectedClinicId) {
      return false;
    }
    if (selectedMonth) {
      if (!p.paid_on.startsWith(selectedMonth)) {
        return false;
      }
    }
    return true;
  });

  const totalAmount = filteredPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium text-foreground">Payments</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Global subscription payment receipts across all clinics</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Summary Card */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">Total Payments Recorded</CardTitle>
            <CreditCard className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium text-foreground">₹{totalAmount.toLocaleString("en-IN")}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Showing {filteredPayments.length} transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-muted/30 p-4 rounded-lg border border-border">
        <div className="flex-1 flex flex-col gap-1">
          <Label className="text-xs">Filter by Clinic</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedClinicId}
            onChange={(e) => setSelectedClinicId(e.target.value)}
          >
            <option value="all">All Clinics</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 flex flex-col gap-1 max-w-xs">
          <Label className="text-xs">Filter by Month</Label>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9"
          />
        </div>

        {(selectedClinicId !== "all" || selectedMonth !== "") && (
          <div className="self-end pb-0.5">
            <button
              type="button"
              onClick={() => {
                setSelectedClinicId("all");
                setSelectedMonth("");
              }}
              className="text-xs text-primary underline underline-offset-2"
            >
              Reset Filters
            </button>
          </div>
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
          ) : filteredPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">No payments recorded matching your selected filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                  <tr>
                    <th className="py-3 px-4">Clinic</th>
                    <th className="py-3 px-4">Paid On</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Period Covered</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-foreground">
                        {p.clinic?.name || "Unknown Clinic"}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">{formatDateIST(p.paid_on)}</td>
                      <td className="py-3.5 px-4 font-medium text-foreground">₹{p.amount}</td>
                      <td className="py-3.5 px-4 text-muted-foreground text-xs">
                        {p.period_from && p.period_to
                          ? `${formatDateIST(p.period_from)} – ${formatDateIST(p.period_to)}`
                          : "—"}
                      </td>
                      <td className="py-3.5 px-4 uppercase text-xs font-medium text-muted-foreground">{p.mode}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{p.reference || "—"}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{p.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
