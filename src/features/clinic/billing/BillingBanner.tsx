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
      <div className="flex items-center gap-5 sm:gap-7">
        <div className="space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-5 w-16" />
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
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Total Billed
        </span>
        <span className="text-sm font-medium text-foreground mt-0.5">
          {formatINR(totalBilled)}
        </span>
      </div>

      {/* Total Paid */}
      <div className="flex flex-col">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Total Paid
        </span>
        <span className="text-sm font-medium text-foreground mt-0.5">
          {formatINR(totalPaid)}
        </span>
      </div>

      {/* Due / Fully Paid */}
      <div className="flex flex-col">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {isDue ? "Due" : "Due"}
        </span>
        <span
          className={
            isDue
              ? "text-sm font-semibold text-amber-600 dark:text-amber-400 mt-0.5"
              : "text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5"
          }
        >
          {isDue ? formatINR(due) : "Fully paid"}
        </span>
      </div>
    </div>
  );
}
