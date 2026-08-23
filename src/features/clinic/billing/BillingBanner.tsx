import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/utils";
import type { PatientBillingSummary } from "@/lib/clinic-api";

interface BillingBannerProps {
  summary: PatientBillingSummary | null;
  loading?: boolean;
}

export function BillingBanner({ summary, loading }: BillingBannerProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
    );
  }

  const totalBilled = summary?.total_billed ?? 0;
  const totalPaid = summary?.total_paid ?? 0;
  const due = summary?.due ?? 0;
  const isDue = due > 0;

  return (
    <div className="flex items-center gap-5 sm:gap-7 flex-wrap sm:flex-nowrap">
      {/* Total Billed */}
      <div className="flex flex-col">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Total Billed
        </span>
        <span className="text-base font-semibold text-foreground tracking-tight">
          {formatINR(totalBilled)}
        </span>
      </div>

      {/* Total Paid */}
      <div className="flex flex-col">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Total Paid
        </span>
        <span className="text-base font-semibold text-emerald-600 dark:text-emerald-400 tracking-tight">
          {formatINR(totalPaid)}
        </span>
      </div>

      {/* Due / Balance */}
      <div className="flex flex-col">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Due
        </span>
        <span
          className={
            isDue
              ? "text-base font-bold text-amber-600 dark:text-amber-400 tracking-tight"
              : "text-base font-semibold text-muted-foreground tracking-tight"
          }
        >
          {isDue ? formatINR(due) : "₹0"}
        </span>
      </div>
    </div>
  );
}
