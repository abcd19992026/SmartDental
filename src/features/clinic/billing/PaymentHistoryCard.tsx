import { useState } from "react";
import { CreditCard, Plus, AlertTriangle } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, cn } from "@/lib/utils";
import { formatDateIST } from "@/lib/dates";
import type { PatientPaymentHistoryEntry } from "@/lib/clinic-api";
import { VoidPaymentModal } from "@/features/clinic/billing/VoidPaymentModal";

interface PaymentHistoryCardProps {
  payments: PatientPaymentHistoryEntry[];
  loading?: boolean;
  onAddPayment?: () => void;
  onRefresh?: () => void;
}

function formatPaymentMode(mode: string): string {
  switch (mode) {
    case "cash":
      return "Cash";
    case "upi":
      return "UPI";
    case "card":
      return "Card";
    case "bank_transfer":
      return "Bank Transfer";
    case "other":
      return "Other";
    default:
      return mode;
  }
}

export function PaymentHistoryCard({
  payments,
  loading,
  onAddPayment,
  onRefresh,
}: PaymentHistoryCardProps) {
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner" || profile?.role === "super_admin";

  const [paymentToVoid, setPaymentToVoid] = useState<PatientPaymentHistoryEntry | null>(null);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Payment History
          </CardTitle>
          {onAddPayment && (
            <Button size="sm" variant="outline" onClick={onAddPayment} className="h-8 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Payment
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No payments recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {payments.map((p) => {
                const isVoided = p.is_voided;

                return (
                  <div
                    key={p.id}
                    className={cn(
                      "py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-opacity",
                      isVoided && "opacity-60"
                    )}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "font-semibold text-sm",
                            isVoided ? "line-through text-muted-foreground" : "text-foreground"
                          )}
                        >
                          {formatINR(p.amount)}
                        </span>

                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] font-normal py-0 px-2",
                            p.mode === "upi" && "border-indigo-200 text-indigo-800 bg-indigo-100 dark:border-indigo-500/30 dark:text-indigo-400 dark:bg-indigo-500/10",
                            p.mode === "cash" && "border-emerald-200 text-emerald-800 bg-emerald-100 dark:border-emerald-500/30 dark:text-emerald-400 dark:bg-emerald-500/10",
                            p.mode === "card" && "border-sky-200 text-sky-800 bg-sky-100 dark:border-sky-500/30 dark:text-sky-400 dark:bg-sky-500/10",
                            p.mode === "bank_transfer" && "border-purple-200 text-purple-800 bg-purple-100 dark:border-purple-500/30 dark:text-purple-400 dark:bg-purple-500/10",
                            p.mode === "other" && "border-slate-200 text-slate-700 bg-slate-100 dark:border-slate-500/30 dark:text-slate-400 dark:bg-slate-500/10"
                          )}
                        >
                          {formatPaymentMode(p.mode)}
                        </Badge>

                        {isVoided && (
                          <Badge
                            variant="outline"
                            className="border-rose-200 text-rose-800 bg-rose-100 dark:border-rose-500/30 dark:text-rose-400 dark:bg-rose-950/40 text-[11px] font-medium"
                          >
                            Voided
                          </Badge>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>Paid on {formatDateIST(p.paid_on)}</span>
                        {p.created_by_name && (
                          <>
                            <span>•</span>
                            <span>Recorded by {p.created_by_name}</span>
                          </>
                        )}
                      </div>

                      {p.notes && (
                        <p className="text-xs text-muted-foreground italic">
                          Notes: {p.notes}
                        </p>
                      )}

                      {isVoided && p.void_reason && (
                        <p className="text-[11px] text-rose-400/90 flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>
                            Voided{p.voided_by_name ? ` by ${p.voided_by_name}` : ""}: {p.void_reason}
                          </span>
                        </p>
                      )}
                    </div>

                    {/* Void Action: strictly for owners only on non-voided payments */}
                    {!isVoided && isOwner && (
                      <div className="sm:self-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPaymentToVoid(p)}
                          className="h-7 px-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-300"
                        >
                          Void
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <VoidPaymentModal
        open={Boolean(paymentToVoid)}
        onOpenChange={(open) => {
          if (!open) setPaymentToVoid(null);
        }}
        payment={paymentToVoid}
        onSuccess={() => {
          setPaymentToVoid(null);
          if (onRefresh) onRefresh();
        }}
      />
    </>
  );
}
