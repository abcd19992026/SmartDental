import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { sendPrescriptionPdf } from "@/lib/clinic-api";
import { cn } from "@/lib/utils";

interface SendPrescriptionButtonProps {
  prescriptionId: string;
  className?: string;
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

export function SendPrescriptionButton({ prescriptionId, className }: SendPrescriptionButtonProps) {
  const { success, error: toastError } = useToast();
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send prescription";
      toastError(message, "Send Failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleSend}
      disabled={sending}
      className={cn("h-8 px-2 text-xs shrink-0", className)}
      title="Send Prescription via WhatsApp"
    >
      {sending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
      ) : (
        <Send className="h-3.5 w-3.5 mr-1" />
      )}
      Send WhatsApp
    </Button>
  );
}
