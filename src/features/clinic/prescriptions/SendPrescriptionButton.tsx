import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { sendPrescriptionPdf } from "@/lib/clinic-api";
import { formatDateIST } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.276-.1-.477-.15-.678.15-.201.3-.777.978-.953 1.179-.176.2-.351.226-.652.075s-1.272-.469-2.423-1.496c-.896-.799-1.501-1.786-1.677-2.087-.176-.3-.019-.462.132-.612.136-.135.301-.351.452-.527.15-.176.201-.3.301-.502.1-.2.05-.376-.025-.526s-.678-1.634-.929-2.238c-.244-.588-.493-.508-.678-.517-.176-.009-.377-.01-.578-.01s-.527.075-.803.376c-.276.301-1.054 1.029-1.054 2.509 0 1.48 1.079 2.91 1.23 3.111.15.201 2.124 3.243 5.145 4.549.718.311 1.279.497 1.716.636.722.23 1.378.197 1.898.12.579-.086 1.78-.727 2.031-1.429.251-.702.251-1.304.176-1.429-.075-.125-.276-.201-.577-.351zM12.04 2C6.54 2 2.08 6.46 2.08 11.96c0 1.758.459 3.473 1.332 4.987L2 22l5.204-1.365c1.464.798 3.114 1.22 4.836 1.22 5.5 0 9.96-4.46 9.96-9.96C22 6.46 17.54 2 12.04 2zm0 18.236c-1.547 0-3.064-.416-4.39-1.203l-.315-.187-3.26.855.87-3.178-.205-.327A8.21 8.21 0 0 1 3.79 11.96c0-4.549 3.702-8.251 8.25-8.251 4.548 0 8.25 3.702 8.25 8.251 0 4.549-3.702 8.251-8.25 8.251z" />
    </svg>
  );
}

interface SendPrescriptionButtonProps {
  prescriptionId: string;
  className?: string;
  patientName?: string;
  prescribedOn?: string;
  doctorName?: string;
}

export function formatSendPrescriptionError(errorCode?: string | null, rawError?: string): string {
  switch (errorCode) {
    case "PATIENT_DND":
      return "This patient has Do Not Disturb on — no message was sent";
    case "WHATSAPP_DISABLED":
      return "WhatsApp is not enabled for this clinic";
    case "CLINIC_SUSPENDED":
      return "This clinic is suspended or its plan has expired";
    case "DAILY_CAP_EXCEEDED":
      return "This clinic has reached its daily WhatsApp message limit";
    case "MONTHLY_QUOTA_EXCEEDED":
      return "This clinic has reached its monthly WhatsApp message limit";
    case "TEMPLATE_MISSING":
      return "The prescription WhatsApp template isn't approved yet";
    default:
      return rawError || "Failed to send prescription";
  }
}

export function SendPrescriptionButton({
  prescriptionId,
  className,
  patientName,
  prescribedOn,
  doctorName,
}: SendPrescriptionButtonProps) {
  const { success, error: toastError } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // Generate client_request_id (uuid) once when the button becomes clickable for this view session.
  // Not regenerated on retry within the same view session.
  const [clientRequestId] = useState(() => crypto.randomUUID());

  async function handleSend() {
    if (sending || !prescriptionId) return;
    setSending(true);
    try {
      const result = await sendPrescriptionPdf(prescriptionId, clientRequestId);
      if (!result.ok) {
        const errorMsg = formatSendPrescriptionError(result.error_code, result.error);
        toastError(errorMsg, "Send Failed");
        return;
      }
      if (!result.data.success) {
        const errorMsg = formatSendPrescriptionError(result.data.error_code, result.data.error_message);
        toastError(errorMsg, "Send Failed");
        return;
      }
      success("Prescription sent via WhatsApp.");
      setConfirmOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send prescription";
      toastError(message, "Send Failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Tooltip content="Send on WhatsApp">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setConfirmOpen(true)}
          className={cn(
            "h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 shrink-0",
            className
          )}
          title="Send Prescription via WhatsApp"
          aria-label="Send Prescription via WhatsApp"
        >
          <WhatsAppIcon className="h-4 w-4 fill-current" />
        </Button>
      </Tooltip>

      <Dialog open={confirmOpen} onOpenChange={(open) => !sending && setConfirmOpen(open)}>
        <div className="flex flex-col gap-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 shrink-0">
                <WhatsAppIcon className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Send Prescription via WhatsApp</DialogTitle>
                <DialogDescription>
                  Are you sure you want to send this prescription PDF to {patientName ? <strong>{patientName}</strong> : "the patient"} on WhatsApp?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/30 p-3.5 text-xs text-muted-foreground space-y-2">
            {prescribedOn && (
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Date Prescribed:</span>
                <span>{formatDateIST(prescribedOn)}</span>
              </div>
            )}
            {doctorName && (
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Prescribing Doctor:</span>
                <span>{doctorName}</span>
              </div>
            )}
            <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground border-t border-border/60">
              The patient will receive a WhatsApp message with the official PDF prescription including clinic letterhead and prescribed medications.
            </p>
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <WhatsAppIcon className="h-4 w-4 fill-current" />
                  Confirm & Send
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </>
  );
}
