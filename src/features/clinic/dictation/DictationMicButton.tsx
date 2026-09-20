import { useState } from "react";
import { Mic, Square, Loader2, Lock, AlertCircle, X, Sparkles } from "lucide-react";
import { useDictationRecorder } from "@/hooks/useDictationRecorder";
import { useDictationGate } from "@/features/clinic/dictation/useDictationGate";
import { dictationErrorMessage, isRetryableDictationError, type DictationErrorCode } from "@/features/clinic/dictation/dictationErrors";
import { logAiDictationInterest, type TranscribeConsultationOutput } from "@/lib/clinic-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MAX_DICTATION_SECONDS = 180;
const WARN_REMAINING_SECONDS = 30;

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface DictationMicButtonProps {
  clinicId: string | null | undefined;
  patientAge?: number;
  patientSex?: string;
  onResult: (result: TranscribeConsultationOutput) => void;
}

/** The one mic button for this consultation -- the doctor taps it as many times as they like
 * during the visit (complaint first, diagnosis after examining, etc); each dictation is a
 * separate recording -> upload -> merge round trip. See mergeDictation.ts for what happens to
 * the result and useDictationRecorder.ts for the recording mechanics. */
export function DictationMicButton({ clinicId, patientAge, patientSex, onResult }: DictationMicButtonProps) {
  const { enabled } = useDictationGate(clinicId);
  const [lockedPanelOpen, setLockedPanelOpen] = useState(false);
  const [interestSubmitted, setInterestSubmitted] = useState(false);
  const [interestSubmitting, setInterestSubmitting] = useState(false);
  const [lastError, setLastError] = useState<{ code: DictationErrorCode; message: string } | null>(null);

  const recorder = useDictationRecorder({
    maxSeconds: MAX_DICTATION_SECONDS,
    patientAge,
    patientSex,
    onResult: (result) => {
      setLastError(null);
      onResult(result);
    },
    onError: (code, message) => {
      setLastError({ code, message });
    },
  });

  async function handleRequestAccess() {
    setInterestSubmitting(true);
    const result = await logAiDictationInterest();
    setInterestSubmitting(false);
    if (result.ok) setInterestSubmitted(true);
  }

  if (enabled === null) {
    return (
      <Button type="button" variant="outline" size="sm" disabled className="gap-1.5 opacity-60">
        <Mic className="h-3.5 w-3.5 text-muted-foreground" />
        Dictate
      </Button>
    );
  }

  if (!enabled) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 text-muted-foreground border-border/80 bg-muted/20 hover:bg-primary/5 hover:text-foreground hover:border-primary/30 transition-all shadow-none"
          onClick={() => setLockedPanelOpen(true)}
        >
          <Mic className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Dictate</span>
          <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-semibold tracking-wide uppercase">
            Upgrade <Lock className="h-2.5 w-2.5 ml-0.5" />
          </span>
        </Button>
        <Dialog open={lockedPanelOpen} onOpenChange={setLockedPanelOpen}>
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <DialogTitle className="text-base font-semibold">AI Clinical Dictation</DialogTitle>
            </div>
            <DialogDescription className="text-sm space-y-2 pt-1 text-muted-foreground">
              <span className="block">
                Fill your prescription by speaking — say the medicine name, everything else fills in automatically.
              </span>
              <span className="block text-xs font-medium text-muted-foreground/80 bg-muted/50 border border-border/60 px-2.5 py-1.5 rounded-md">
                This feature isn't included in your plan.
              </span>
            </DialogDescription>
          </DialogHeader>
          {interestSubmitted ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
              Your interest has been noted — we'll be in touch.
            </div>
          ) : (
            <DialogFooter>
              <Button type="button" onClick={handleRequestAccess} disabled={interestSubmitting} className="gap-1.5">
                {interestSubmitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Request access
              </Button>
            </DialogFooter>
          )}
        </Dialog>
      </>
    );
  }

  const remaining = MAX_DICTATION_SECONDS - recorder.seconds;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {recorder.state === "idle" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5 text-foreground transition-all duration-200 shadow-xs"
            onClick={recorder.start}
          >
            <Mic className="h-4 w-4 text-primary" />
            <span>Dictate</span>
          </Button>
        )}

        {recorder.state === "requesting" && (
          <Button type="button" variant="outline" size="sm" disabled className="gap-2 opacity-80">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>Requesting mic...</span>
          </Button>
        )}

        {recorder.state === "recording" && (
          <div className="flex items-center gap-2.5 rounded-full border border-red-500/30 bg-red-50/60 dark:bg-red-950/30 px-3 py-1.5 shadow-sm transition-all duration-200 animate-in fade-in">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span
              className={cn(
                "text-xs font-mono tabular-nums font-medium",
                remaining <= WARN_REMAINING_SECONDS ? "text-amber-600 dark:text-amber-400 font-bold animate-pulse" : "text-foreground"
              )}
            >
              {formatTimer(recorder.seconds)}
            </span>
            {/* Live audio level visualizer reacting to voice level */}
            <div className="flex items-end gap-0.5 h-3.5 w-6 px-0.5" aria-hidden="true" title={`Level: ${Math.round(recorder.level * 100)}%`}>
              {[0.6, 1.0, 0.8, 0.5].map((multiplier, i) => {
                const heightPercent = Math.max(20, Math.min(100, Math.round(recorder.level * multiplier * 100)));
                return (
                  <span
                    key={i}
                    className="w-1 rounded-full bg-red-500 dark:bg-red-400 transition-[height] duration-100 ease-out"
                    style={{ height: `${heightPercent}%` }}
                  />
                );
              })}
            </div>
            {remaining <= WARN_REMAINING_SECONDS && (
              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full">
                {remaining}s left
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-6 px-2.5 gap-1 text-[11px] font-medium rounded-full shadow-xs"
              onClick={recorder.stop}
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              <span>Stop</span>
            </Button>
            <button
              type="button"
              title="Cancel recording (discards audio)"
              onClick={recorder.cancel}
              className="text-muted-foreground hover:text-destructive p-1 rounded-full hover:bg-destructive/10 transition-colors"
              aria-label="Cancel recording"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {recorder.state === "processing" && (
          <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 dark:bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground shadow-xs animate-in fade-in duration-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
            <span>Transcribing consultation...</span>
          </div>
        )}

        {recorder.state === "error" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5 text-foreground transition-all duration-200 shadow-xs"
            onClick={recorder.start}
          >
            <Mic className="h-4 w-4 text-primary" />
            <span>Dictate</span>
          </Button>
        )}
      </div>

      {lastError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 dark:bg-destructive/10 px-3 py-2 text-xs text-foreground shadow-sm animate-in fade-in duration-200 max-w-md">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <span className="flex-1 leading-tight">{dictationErrorMessage(lastError.code)}</span>
          {isRetryableDictationError(lastError.code) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-5 px-2 text-[10px] font-medium text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
              onClick={recorder.start}
            >
              Retry
            </Button>
          )}
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
            onClick={() => setLastError(null)}
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

