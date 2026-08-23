import { useState, useEffect, type FormEvent } from "react";
import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { voidPayment, type PatientPaymentHistoryEntry } from "@/lib/clinic-api";
import { formatINR } from "@/lib/utils";
import { formatDateIST } from "@/lib/dates";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface VoidPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PatientPaymentHistoryEntry | null;
  onSuccess?: () => void;
}

export function VoidPaymentModal({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: VoidPaymentModalProps) {
  const { success: toastSuccess } = useToast();

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setErrorMsg(null);
    }
  }, [open]);

  if (!payment) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!payment) return;

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setErrorMsg("Please enter a reason for voiding this payment.");
      return;
    }

    setSubmitting(true);

    const res = await voidPayment(payment.id, trimmedReason);

    if (!res.ok || !res.data || !res.data.id) {
      // Voiding failed or zero rows affected (e.g. database blocked write)
      const failureReason = (!res.ok && res.error) ? res.error : "Payment could not be voided. No changes were made.";
      setErrorMsg(failureReason);
      setSubmitting(false);
      return;
    }

    toastSuccess("Payment voided successfully.");
    setSubmitting(false);
    onOpenChange(false);
    if (onSuccess) {
      onSuccess();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Void Payment
          </DialogTitle>
          <DialogDescription>
            Void payment of {formatINR(payment.amount)} recorded on {formatDateIST(payment.paid_on)}
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-col gap-4 py-4 max-h-[65vh] overflow-y-auto px-1">
          {/* Warning notice */}
          <div className="rounded-lg border border-amber-600/30 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
            <p className="font-medium">Warning: This action cannot be undone.</p>
            <p className="mt-1 text-muted-foreground">
              Voiding this payment will reverse {formatINR(payment.amount)} and increase the patient&apos;s due balance.
            </p>
          </div>

          {/* Reason input */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="void-reason">Reason for Voiding *</Label>
            <Input
              id="void-reason"
              required
              placeholder="e.g. Entered incorrect amount, duplicate entry, patient refund"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Void Payment
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
