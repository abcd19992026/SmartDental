import { useState } from "react";
import { Mic, Square, Loader2, Lock, AlertCircle, X } from "lucide-react";
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

  async function handleMujheChahiye() {
    setInterestSubmitting(true);
    const result = await logAiDictationInterest();
    setInterestSubmitting(false);
    if (result.ok) setInterestSubmitted(true);
  }

  if (enabled === null) {
    return (
      <Button type="button" variant="outline" size="sm" disabled className="gap-1.5 opacity-60">
        <Mic className="h-3.5 w-3.5" />
        Dictate
      </Button>
    );
  }

  if (!enabled) {
    return (
      <>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setLockedPanelOpen(true)}>
          <Mic className="h-3.5 w-3.5" />
          Dictate
          <Lock className="h-3 w-3" />
        </Button>
        <Dialog open={lockedPanelOpen} onOpenChange={setLockedPanelOpen}>
          <DialogHeader>
            <DialogTitle>AI Dictation</DialogTitle>
            <DialogDescription>
              Bolkar prescription bharein — dawa ka naam boliye, baaki apne aap bhar jayega.
              <br />
              Ye feature aapke plan me shamil nahi hai.
            </DialogDescription>
          </DialogHeader>
          {interestSubmitted ? (
            <p className="text-sm text-muted-foreground py-2">Aapki ruchi darj ho gayi — hum sampark karenge.</p>
          ) : (
            <DialogFooter>
              <Button type="button" onClick={handleMujheChahiye} disabled={interestSubmitting}>
                {interestSubmitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Mujhe chahiye
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
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={recorder.start}>
            <Mic className="h-3.5 w-3.5" />
            Dictate
          </Button>
        )}

        {recorder.state === "requesting" && (
          <Button type="button" variant="outline" size="sm" disabled className="gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Requesting mic...
          </Button>
        )}

        {recorder.state === "recording" && (
          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
            </span>
            <span className="text-xs font-mono tabular-nums w-10">{formatTimer(recorder.seconds)}</span>
            <div className="h-2 w-16 rounded-full bg-muted overflow-hidden" aria-hidden>
              <div
                className="h-full bg-primary transition-[width] duration-100"
                style={{ width: `${Math.round(recorder.level * 100)}%` }}
              />
            </div>
            {remaining <= WARN_REMAINING_SECONDS && (
              <span className="text-[11px] text-amber-600">{remaining}s left</span>
            )}
            <Button type="button" size="sm" variant="destructive" className="h-7 px-2 gap-1" onClick={recorder.stop}>
              <Square className="h-3 w-3" />
              Stop
            </Button>
            <button type="button" title="Cancel — discard this recording" onClick={recorder.cancel} className="text-muted-foreground hover:text-destructive p-1">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {recorder.state === "processing" && (
          <Button type="button" variant="outline" size="sm" disabled className="gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Processing...
          </Button>
        )}

        {recorder.state === "error" && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={recorder.start}>
            <Mic className="h-3.5 w-3.5" />
            Dictate
          </Button>
        )}
      </div>

      {lastError && (
        <div className={cn("flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive")}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="flex-1">{dictationErrorMessage(lastError.code)}</span>
          {isRetryableDictationError(lastError.code) && (
            <button type="button" className="underline shrink-0" onClick={recorder.start}>
              Retry
            </button>
          )}
          <button type="button" className="shrink-0" onClick={() => setLastError(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
