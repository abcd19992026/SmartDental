import { useState, useEffect, type FormEvent } from "react";
import { AlertCircle, CreditCard, Loader2, Printer } from "lucide-react";
import {
  insertPayment,
  isAlreadySavedError,
  type InsertPaymentInput,
} from "@/lib/clinic-api";
import { supabase } from "@/lib/supabase";
import { todayIST } from "@/lib/dates";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
  const { success: toastSuccess, toast } = useToast();

  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [paidOn, setPaidOn] = useState(todayIST());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitAction, setSubmitAction] = useState<"record" | "print" | null>(null);
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
      setSubmitAction(null);
      setClientRequestId(crypto.randomUUID());
    }
  }, [open]);

  async function executeSubmit(shouldPrint: boolean) {
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

    // Opened synchronously, before any await below -- a window.open() call after an await falls
    // outside this click's user-gesture window and gets silently popup-blocked in most browsers
    // (same reasoning as AddVisitModal's handleSaveAndPrint).
    const win = shouldPrint ? window.open("", "_blank") : null;

    setSubmitting(true);
    setSubmitAction(shouldPrint ? "print" : "record");

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

    const isCollidedSuccess = !res.ok && isAlreadySavedError(res.error);
    const isDirectSuccess = res.ok && res.data && res.data.id;

    if (!isCollidedSuccess && !isDirectSuccess) {
      // Row was not affected or write was blocked/failed
      const failureReason =
        !res.ok && res.error
          ? res.error
          : "Payment could not be recorded. No changes were saved.";
      setErrorMsg(failureReason);
      win?.close();
      setSubmitting(false);
      setSubmitAction(null);
      return;
    }

    // If "Record & Print" was clicked, open the patient's most recent prescription in the tab
    // opened above -- the payment itself is already recorded successfully at this point
    // regardless of what happens next, so a missing prescription is never treated as an error.
    if (shouldPrint) {
      const { data: latestRx } = await supabase
        .from("prescriptions")
        .select("id")
        .eq("patient_id", patientId)
        .order("prescribed_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestRx) {
        if (win) {
          win.location.href = `/app/prescriptions/${latestRx.id}/print?print=1`;
        }
      } else {
        win?.close();
        toast({
          description: "This patient has no prescription yet -- nothing to print.",
          type: "info",
        });
      }
    }

    toastSuccess("Payment recorded successfully.");
    setSubmitting(false);
    setSubmitAction(null);
    onOpenChange(false);
    if (onSuccess) {
      onSuccess();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    executeSubmit(false);
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

        <DialogFooter className="border-t border-border pt-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={(e) => {
              e.preventDefault();
              executeSubmit(true);
            }}
          >
            {submitting && submitAction === "print" ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Printer className="h-4 w-4 mr-1.5" />
            )}
            Record & Print
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={(e) => {
              e.preventDefault();
              executeSubmit(false);
            }}
          >
            {submitting && submitAction === "record" ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : null}
            Record Payment
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
