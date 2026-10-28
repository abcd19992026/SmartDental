import { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import {
  verifyWhatsappNumber,
  attachClinicWhatsapp,
  detachClinicWhatsapp,
  type VerifyWhatsappNumberOutput,
} from "@/lib/admin-api";
import type { Database } from "@/types/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];

export interface WhatsAppNumberCardProps {
  clinic: ClinicRow;
  hasApprovedDefaultTemplate?: boolean;
  onRefresh: () => Promise<void> | void;
}

/**
 * Maps raw backend/Edge Function errors to plain-language messages.
 * Never outputs raw JSON or internal codes.
 */
export function mapWhatsAppError(rawError: string): {
  message: string;
  isGeneric: boolean;
} {
  const lower = rawError.toLowerCase();

  // 1. Phone number already used by another clinic
  if (
    lower.includes("phone_number_in_use") ||
    lower.includes("already attached to another clinic") ||
    lower.includes("already in use") ||
    lower.includes("23505")
  ) {
    return {
      message: "This number is already attached to another clinic.",
      isGeneric: false,
    };
  }

  // 2. Meta could not find the number
  if (
    lower.includes("could not find this phone_number_id") ||
    lower.includes("meta access does not cover it") ||
    lower.includes("meta does not know") ||
    lower.includes("meta could not find") ||
    lower.includes("unexpected answer for this number")
  ) {
    return {
      message:
        "Meta does not know this Phone number ID, or it is not in our account. Check the ID.",
      isGeneric: false,
    };
  }

  // 3. Clinic already has an Embedded Signup connection
  if (
    lower.includes("self_connection_exists") ||
    lower.includes("self-connected") ||
    lower.includes("disconnect that first") ||
    lower.includes("embedded signup")
  ) {
    return {
      message:
        "This clinic connected its own WhatsApp number. Disconnect that first.",
      isGeneric: false,
    };
  }

  // 4. Not allowed / 401 / 403
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("not allowed") ||
    lower.includes("super admin access required") ||
    lower.includes("not authenticated")
  ) {
    return {
      message: "You are not allowed to do this.",
      isGeneric: false,
    };
  }

  // 5. Fallback for any other error
  return {
    message: "Something went wrong. Nothing was changed.",
    isGeneric: true,
  };
}

export function WhatsAppNumberCard({
  clinic,
  hasApprovedDefaultTemplate,
  onRefresh,
}: WhatsAppNumberCardProps) {
  const { profile, realProfile } = useAuth();
  const { success } = useToast();

  // Only visible when the logged-in user is super_admin (hide for owner and receptionist)
  const isSuperAdmin =
    realProfile?.role === "super_admin" || profile?.role === "super_admin";

  // Form states
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessId, setBusinessId] = useState("");

  // Loading states
  const [isChecking, setIsChecking] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isDetaching, setIsDetaching] = useState(false);

  // Verification result for the exact current values
  const [verifiedFor, setVerifiedFor] = useState<{
    phoneNumberId: string;
    businessId: string;
    info: VerifyWhatsappNumberOutput;
    hasApprovedDefaultTemplate: boolean;
  } | null>(null);

  // Dialog states
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [detachDialogOpen, setDetachDialogOpen] = useState(false);

  // Error state with retry action
  const [actionError, setActionError] = useState<{
    message: string;
    canRetry: boolean;
    retryAction?: () => void;
  } | null>(null);

  if (!isSuperAdmin) {
    return null;
  }

  const isAttached = Boolean(clinic.waba_phone_number_id);

  // Attach button is disabled until Check with Meta has succeeded for the exact values
  const isAttachDisabled =
    !verifiedFor ||
    verifiedFor.phoneNumberId !== phoneNumberId.trim() ||
    verifiedFor.businessId !== businessId.trim() ||
    isChecking ||
    isAttaching ||
    isDetaching;

  function handlePhoneNumberChange(val: string) {
    // Digits only: strip spaces, reject non-digits
    const clean = val.replace(/\s+/g, "").replace(/\D/g, "");
    setPhoneNumberId(clean);
    if (verifiedFor) {
      setVerifiedFor(null);
    }
    if (actionError) {
      setActionError(null);
    }
  }

  function handleBusinessIdChange(val: string) {
    // Digits only: strip spaces, reject non-digits
    const clean = val.replace(/\s+/g, "").replace(/\D/g, "");
    setBusinessId(clean);
    if (verifiedFor) {
      setVerifiedFor(null);
    }
    if (actionError) {
      setActionError(null);
    }
  }

  async function handleCheckWithMeta() {
    const cleanPhoneId = phoneNumberId.trim();
    if (!cleanPhoneId) {
      setActionError({
        message: "Phone number ID is required.",
        canRetry: false,
      });
      return;
    }

    setIsChecking(true);
    setActionError(null);
    setVerifiedFor(null);

    const res = await verifyWhatsappNumber(cleanPhoneId);
    setIsChecking(false);

    if (!res.ok) {
      const mapped = mapWhatsAppError(res.error);
      setActionError({
        message: mapped.message,
        canRetry: mapped.isGeneric,
        retryAction: () => handleCheckWithMeta(),
      });
      return;
    }

    if (res.data.verified) {
      let hasTemplate = hasApprovedDefaultTemplate;
      if (hasTemplate === undefined) {
        try {
          const { count } = await supabase
            .from("whatsapp_templates")
            .select("id", { count: "exact", head: true })
            .eq("clinic_id", clinic.id)
            .eq("is_default", true)
            .eq("approval_status", "approved");
          hasTemplate = (count ?? 0) > 0;
        } catch {
          hasTemplate = false;
        }
      }

      setVerifiedFor({
        phoneNumberId: cleanPhoneId,
        businessId: businessId.trim(),
        info: res.data,
        hasApprovedDefaultTemplate: Boolean(hasTemplate),
      });
    } else {
      setActionError({
        message: "Something went wrong. Nothing was changed.",
        canRetry: true,
        retryAction: () => handleCheckWithMeta(),
      });
    }
  }

  async function handleAttachConfirm() {
    if (!verifiedFor) return;

    setIsAttaching(true);
    setActionError(null);

    const res = await attachClinicWhatsapp({
      clinic_id: clinic.id,
      waba_phone_number_id: verifiedFor.phoneNumberId,
      waba_business_id: verifiedFor.businessId ? verifiedFor.businessId : undefined,
      enable: true,
    });

    setIsAttaching(false);

    if (!res.ok) {
      setAttachDialogOpen(false);
      const mapped = mapWhatsAppError(res.error);
      setActionError({
        message: mapped.message,
        canRetry: mapped.isGeneric,
        retryAction: () => setAttachDialogOpen(true),
      });
      return;
    }

    // Never show success unless the wrapper returned success (saved: true)
    if (res.data.saved) {
      setAttachDialogOpen(false);
      setPhoneNumberId("");
      setBusinessId("");
      setVerifiedFor(null);
      success("WhatsApp number attached successfully.");
      await onRefresh();
    } else {
      setAttachDialogOpen(false);
      setActionError({
        message: "Something went wrong. Nothing was changed.",
        canRetry: true,
        retryAction: () => setAttachDialogOpen(true),
      });
    }
  }

  async function handleDetachConfirm() {
    setIsDetaching(true);
    setActionError(null);

    const res = await detachClinicWhatsapp(clinic.id);
    setIsDetaching(false);

    if (!res.ok) {
      setDetachDialogOpen(false);
      const mapped = mapWhatsAppError(res.error);
      setActionError({
        message: mapped.message,
        canRetry: mapped.isGeneric,
        retryAction: () => handleDetachConfirm(),
      });
      return;
    }

    // Never show success unless the wrapper returned success (detached: true)
    if (res.data.detached) {
      setDetachDialogOpen(false);
      success("WhatsApp number detached successfully.");
      await onRefresh();
    } else {
      setDetachDialogOpen(false);
      setActionError({
        message: "Something went wrong. Nothing was changed.",
        canRetry: true,
        retryAction: () => handleDetachConfirm(),
      });
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">WhatsApp number</CardTitle>
          <CardDescription>
            Onboard and manage the dedicated Meta WhatsApp Business number attached to this clinic
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {/* Plain-language error alert */}
          {actionError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError.message}</span>
              </div>
              {actionError.canRetry && actionError.retryAction && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 text-xs border-destructive/30 hover:bg-destructive/20 text-destructive self-start sm:self-auto"
                  onClick={actionError.retryAction}
                  disabled={isChecking || isAttaching || isDetaching}
                >
                  Try again
                </Button>
              )}
            </div>
          )}

          {/* Current state area */}
          {isAttached ? (
            <div className="flex flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-2 rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Phone number ID</span>
                  <span className="font-mono text-sm font-semibold text-foreground break-all">
                    {clinic.waba_phone_number_id}
                  </span>
                </div>

                {clinic.waba_business_id && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      WhatsApp account ID
                    </span>
                    <span className="font-mono text-sm font-semibold text-foreground break-all">
                      {clinic.waba_business_id}
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Messaging status</span>
                  <div>
                    {clinic.whatsapp_enabled ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-start">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDetachDialogOpen(true)}
                  disabled={isDetaching}
                >
                  {isDetaching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Detaching...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Detach number
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Neutral empty state */}
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No WhatsApp number attached to this clinic yet.
              </div>

              {/* Form when no number is attached */}
              <div className="flex flex-col gap-5 max-w-2xl">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="superadmin-waba-phone-id">
                    Phone number ID <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="superadmin-waba-phone-id"
                    placeholder="e.g. 1098234876"
                    value={phoneNumberId}
                    onChange={(e) => handlePhoneNumberChange(e.target.value)}
                    disabled={isChecking || isAttaching}
                  />
                  <p className="text-xs text-muted-foreground">
                    Copy this from Meta: WhatsApp Manager, Phone numbers, or the API Setup page. It is a long number, not the phone number itself.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="superadmin-waba-biz-id">
                    WhatsApp account ID (optional)
                  </Label>
                  <Input
                    id="superadmin-waba-biz-id"
                    placeholder="e.g. 9847293847"
                    value={businessId}
                    onChange={(e) => handleBusinessIdChange(e.target.value)}
                    disabled={isChecking || isAttaching}
                  />
                  <p className="text-xs text-muted-foreground">
                    Digits only.
                  </p>
                </div>

                {/* Verification result box */}
                {verifiedFor && (
                  <div className="rounded-lg border border-border bg-muted/40 p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Number verified with Meta</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground">Display Phone Number</span>
                        <span className="font-mono font-medium text-foreground text-sm">
                          {verifiedFor.info.display_phone_number || "—"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground">Verified Name</span>
                        <span className="font-medium text-foreground text-sm">
                          {verifiedFor.info.verified_name || "—"}
                        </span>
                      </div>
                      {verifiedFor.info.quality_rating && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground">Quality Rating</span>
                          <span className="font-medium text-foreground">
                            {verifiedFor.info.quality_rating}
                          </span>
                        </div>
                      )}
                      {verifiedFor.info.code_verification_status && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground">Verification Status</span>
                          <span className="font-medium text-foreground">
                            {verifiedFor.info.code_verification_status}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Template warning / status */}
                    {verifiedFor.hasApprovedDefaultTemplate ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>Clinic has an approved default template.</span>
                      </div>
                    ) : (
                      <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2 mt-1">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">Missing default template</p>
                          <p className="mt-0.5">
                            This clinic has no approved default template. Test messages will fail until one is added.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCheckWithMeta}
                    disabled={!phoneNumberId.trim() || isChecking || isAttaching}
                  >
                    {isChecking ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Checking with Meta...
                      </>
                    ) : (
                      "Check with Meta"
                    )}
                  </Button>

                  <Button
                    type="button"
                    onClick={() => setAttachDialogOpen(true)}
                    disabled={isAttachDisabled}
                  >
                    Attach to this clinic
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attach confirmation dialog */}
      <Dialog open={attachDialogOpen} onOpenChange={setAttachDialogOpen}>
        <DialogHeader>
          <DialogTitle>Attach WhatsApp number</DialogTitle>
          <DialogDescription>
            Confirm attaching this verified WhatsApp number to the clinic.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3 text-sm">
          <div className="flex items-center justify-between py-1.5 border-b border-border">
            <span className="text-muted-foreground">Clinic</span>
            <span className="font-medium text-foreground">{clinic.name}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-border">
            <span className="text-muted-foreground">Display Phone Number</span>
            <span className="font-mono font-medium text-foreground">
              {verifiedFor?.info.display_phone_number || "—"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-border">
            <span className="text-muted-foreground">Verified Name</span>
            <span className="font-medium text-foreground">
              {verifiedFor?.info.verified_name || "—"}
            </span>
          </div>
          {verifiedFor?.businessId && (
            <div className="flex items-center justify-between py-1.5 border-b border-border">
              <span className="text-muted-foreground">WhatsApp Account ID</span>
              <span className="font-mono text-foreground">
                {verifiedFor.businessId}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAttachDialogOpen(false)}
            disabled={isAttaching}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAttachConfirm}
            disabled={isAttaching}
          >
            {isAttaching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Attaching...
              </>
            ) : (
              "Attach"
            )}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Detach confirmation dialog */}
      <Dialog open={detachDialogOpen} onOpenChange={setDetachDialogOpen}>
        <DialogHeader>
          <DialogTitle>Detach WhatsApp number?</DialogTitle>
          <DialogDescription>
            WhatsApp messages will stop for this clinic until a number is attached again.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 text-sm text-muted-foreground">
          Are you sure you want to detach the WhatsApp number (
          <span className="font-mono font-medium text-foreground">
            {clinic.waba_phone_number_id}
          </span>
          ) from <strong>{clinic.name}</strong>?
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDetachDialogOpen(false)}
            disabled={isDetaching}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDetachConfirm}
            disabled={isDetaching}
          >
            {isDetaching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Detaching...
              </>
            ) : (
              "Detach"
            )}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
