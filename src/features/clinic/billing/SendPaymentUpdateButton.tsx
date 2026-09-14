import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { sendPaymentUpdateMessage } from "@/lib/clinic-api";
import { cn } from "@/lib/utils";

interface SendPaymentUpdateButtonProps {
  patientId: string;
  patientName: string;
  className?: string;
}

export function formatPaymentUpdateError(errorCode?: string | null, rawError?: string): string {
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
      return "This clinic has no approved payment-update template";
    default: {
      if (rawError) {
        if (rawError.toLowerCase().includes("outside your branch")) {
          return "This patient is outside your branch";
        }
        if (rawError.toLowerCase().includes("no waba phone number")) {
          return "This clinic has no WhatsApp phone number configured";
        }
        return rawError;
      }
      return "Failed to send payment update";
    }
  }
}

export function SendPaymentUpdateButton({
  patientId,
  patientName,
  className,
}: SendPaymentUpdateButtonProps) {
  const { success, error: toastError } = useToast();
  const [sending, setSending] = useState(false);
  // Generate client_request_id (uuid) once when the button becomes clickable for this view session.
  // Not regenerated on retry within the same view session.
  const [clientRequestId] = useState(() => crypto.randomUUID());

  async function handleSend() {
    if (sending || !patientId) return;
    setSending(true);
    try {
      const result = await sendPaymentUpdateMessage(patientId, clientRequestId);
      if (!result.ok) {
        const errorMsg = formatPaymentUpdateError(result.error_code, result.error);
        toastError(errorMsg, "Send Failed");
        return;
      }
      if (!result.data.success) {
        const errorMsg = formatPaymentUpdateError(result.data.error_code, result.data.error_message);
        toastError(errorMsg, "Send Failed");
        return;
      }
      const displayName = patientName?.trim() || "patient";
      success(`Payment update sent to ${displayName}.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send payment update";
      toastError(message, "Send Failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleSend}
      disabled={sending}
      className={cn("h-8 text-xs", className)}
      title="Send Payment Update via WhatsApp"
    >
      {sending ? (
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Send className="h-3.5 w-3.5 mr-1.5" />
      )}
      Send Payment Update
    </Button>
  );
}
