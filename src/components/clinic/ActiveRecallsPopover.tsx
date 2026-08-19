import { useState, useRef, useEffect, type ReactNode } from "react";
import { Clock, Pause, Play } from "lucide-react";
import { formatDateIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RecallRow = Database["public"]["Tables"]["recalls"]["Row"];
type VisitRow = Database["public"]["Tables"]["visits"]["Row"];
type TreatmentTypeRow = Database["public"]["Tables"]["treatment_types"]["Row"];

export interface JoinedRecall extends RecallRow {
  patient?: Database["public"]["Tables"]["patients"]["Row"] | null;
  visit?: (VisitRow & { treatment_type?: TreatmentTypeRow | null }) | null;
}

interface ActiveRecallsPopoverProps {
  patientName: string;
  recalls: JoinedRecall[];
  onTogglePause?: (recall: JoinedRecall) => Promise<void>;
  children: ReactNode;
}

export function ActiveRecallsPopover({
  patientName,
  recalls,
  onTogglePause,
  children,
}: ActiveRecallsPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div onClick={() => setOpen((prev) => !prev)} className="cursor-pointer">
        {children}
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-72 sm:w-80 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in-50 zoom-in-95">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
            <span className="text-xs font-semibold text-foreground">
              Active Recalls ({recalls.length})
            </span>
            <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
              {patientName}
            </span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {recalls.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">No active recalls found.</p>
            ) : (
              recalls.map((r) => {
                const treatmentName = r.visit?.treatment_type?.name || "General Checkup";
                const isPaused = r.status === "paused";

                return (
                  <div
                    key={r.id}
                    className={cn(
                      "flex items-center justify-between gap-2 p-2 rounded-md border border-border text-xs transition-colors",
                      isPaused ? "bg-muted/40" : "bg-card"
                    )}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-foreground truncate">{treatmentName}</span>
                      <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground text-[11px]">
                        <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span>Due: {formatDateIST(r.due_date)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize text-[10px] py-0 px-1.5 font-normal",
                          r.status === "pending" && "border-amber-600/30 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40",
                          r.status === "sent" && "border-primary/30 text-primary bg-primary/5 dark:bg-primary/10",
                          r.status === "contacted" && "border-amber-600/30 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40",
                          r.status === "paused" && "border-slate-500/30 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/40"
                        )}
                      >
                        {r.status}
                      </Badge>

                      {onTogglePause && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title={isPaused ? "Resume Recall" : "Pause Recall"}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await onTogglePause(r);
                          }}
                        >
                          {isPaused ? <Play className="h-3 w-3 text-emerald-600" /> : <Pause className="h-3 w-3 text-amber-600" />}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
