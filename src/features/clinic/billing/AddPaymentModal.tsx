import { useState, useEffect, type FormEvent } from "react";
import { AlertCircle, CreditCard, Loader2 } from "lucide-react";
import { insertPayment, isAlreadySavedError, type InsertPaymentInput } from "@/lib/clinic-api";
import { todayIST } from "@/lib/dates";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface AddPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName?: string;
  clinicId: string;
  branchId: string;
  onSuccess?: () => void;
}

type PaymentMode = "cash" | "upi" | "card" | "bank_transfer" | "other";

export function AddPaymentModal({
  open,
  onOpenChange,
  patientId,
  patientName,
  clinicId,
  branchId,
  onSuccess,
}: AddPaymentModalProps) {
  const { success: toastSuccess } = useToast();

  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [paidOn, setPaidOn] = useState(todayIST());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Generated once per form opening, held for the lifetime of this form instance, sent
  // unchanged on every submit attempt -- a retry after a slow/failed response must collide with
  // the same value, not generate a fresh one, or double-submit protection does nothing.
  const [clientRequestId, setClientRequestId] = useState("");

  // Reset on open
  useEffect(() => {
    if (open) {
      setAmount("");
      setMode("cash");
      setPaidOn(todayIST());
      setNotes("");
      setErrorMsg(null);
      setClientRequestId(crypto.randomUUID());
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg("Amount must be greater than zero.");
      return;
    }

    const today = todayIST();
    if (!paidOn || paidOn > today) {
      setErrorMsg("Date cannot be in the future.");
      return;
    }

    if (!clinicId || !branchId || !patientId) {
      setErrorMsg("Missing clinic, branch, or patient information.");
      return;
    }

    setSubmitting(true);

    const input: InsertPaymentInput = {
      patient_id: patientId,
      clinic_id: clinicId,
      branch_id: branchId,
      amount: parsedAmount,
      mode,
      paid_on: paidOn,
      notes: notes.trim() || null,
      client_request_id: clientRequestId,
    };

    const res = await insertPayment(input);

    if (!res.ok && isAlreadySavedError(res.error)) {
      // A retry collided with this same form instance's earlier successful submit -- the row
      // exists, which is what the user wanted. Treat it as success, not an error.
      toastSuccess("Payment recorded successfully.");
      setSubmitting(false);
      onOpenChange(false);
      if (onSuccess) onSuccess();
      return;
    }

    if (!res.ok || !res.data || !res.data.id) {
      // Row was not affected or write was blocked/failed
      const failureReason = (!res.ok && res.error) ? res.error : "Payment could not be recorded. No changes were saved.";
      setErrorMsg(failureReason);
      setSubmitting(false);
      return;
    }

    toastSuccess("Payment recorded successfully.");
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
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Record Payment
          </DialogTitle>
          <DialogDescription>
            {patientName ? `Record a payment for ${patientName}` : "Record a patient payment"}
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-col gap-4 py-4 max-h-[65vh] overflow-y-auto px-1">
          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-amount">Amount (₹) *</Label>
            <Input
              id="pay-amount"
              type="number"
              min="0.01"
              step="any"
              required
              placeholder="e.g. 2000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          {/* Mode & Date */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-mode">Payment Mode *</Label>
              <select
                id="pay-mode"
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={mode}
                onChange={(e) => setMode(e.target.value as PaymentMode)}
                required
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-date">Payment Date *</Label>
              <Input
                id="pay-date"
                type="date"
                required
                max={todayIST()}
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-notes">Notes</Label>
            <Input
              id="pay-notes"
              placeholder="e.g. Advance payment / Final settlement"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Record Payment
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
