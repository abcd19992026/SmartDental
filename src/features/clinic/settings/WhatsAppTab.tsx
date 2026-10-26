import { useEffect, useState, useRef, type FormEvent } from "react";
import {
  MessageSquare,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { todayIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { startWhatsAppSignup, useFacebookSdkStatus } from "@/lib/whatsapp-embedded-signup";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
  sendTestMessage,
  WHATSAPP_PAYMENT_UNKNOWN_MESSAGE,
  type WhatsAppStatus,
} from "@/lib/clinic-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const MOBILE_RE = /^\d{10}$/;

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];
type TemplateRow = Database["public"]["Tables"]["whatsapp_templates"]["Row"];

export function WhatsAppTab() {
  const { profile } = useAuth();
  const { success, error: toastError, toast } = useToast();

  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);
  const [defaultTemplate, setDefaultTemplate] = useState<TemplateRow | null>(null);
  const [messagesSentThisMonth, setMessagesSentThisMonth] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Connect flow states
  const inFlightRef = useRef(false);
  const [connectStep, setConnectStep] = useState<"idle" | "popup" | "connecting">("idle");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectInfo, setConnectInfo] = useState<string | null>(null);
  // Loads + initialises the Facebook SDK as soon as this tab mounts, so FB.login can run inside the
  // click itself (a popup opened after any wait is blocked by the browser).
  const sdkStatus = useFacebookSdkStatus();

  // Disconnect confirmation modal state
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Existing Form State
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  // The whatsapp_enabled value this page last read FROM THE SERVER. Connecting/disconnecting changes it
  // server-side (connect switches automatic sending off), so Save compares against it and never writes
  // a stale checkbox value back.
  const loadedEnabledRef = useRef(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    loadAllData();
  }, [profile?.clinic_id]);

  async function loadStatus() {
    const res = await getWhatsAppStatus();
    if (res.ok) {
      setWaStatus(res.data);
    }
  }

  /** Re-reads the clinic row (and so whatsapp_enabled) without the full-page skeleton. Used after
   * connect/disconnect, which change whatsapp_enabled on the server. */
  async function refreshClinicState() {
    if (!profile?.clinic_id) return;
    const { data, error } = await supabase.from("clinics").select("*").eq("id", profile.clinic_id).single();
    if (error || !data) return;
    setClinic(data);
    const enabled = data.whatsapp_enabled ?? false;
    loadedEnabledRef.current = enabled;
    setWhatsappEnabled(enabled);
  }

  async function refreshAfterConnectionChange() {
    await Promise.all([loadStatus(), refreshClinicState()]);
  }

  async function loadAllData() {
    if (!profile?.clinic_id) return;
    setLoading(true);
    setErrorMsg(null);

    const todayStr = todayIST();
    const currentMonthStart = `${todayStr.substring(0, 7)}-01`;

    const [statusRes, cRes, tRes, uRes, mRes] = await Promise.all([
      getWhatsAppStatus(),
      supabase.from("clinics").select("*").eq("id", profile.clinic_id).single(),
      supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("clinic_id", profile.clinic_id)
        .eq("is_default", true)
        .eq("approval_status", "approved")
        .maybeSingle(),
      supabase
        .from("clinic_usage")
        .select("messages_sent")
        .eq("clinic_id", profile.clinic_id)
        .eq("month", currentMonthStart)
        .maybeSingle(),
      supabase
        .from("message_log")
        .select("id", { count: "exact" })
        .eq("clinic_id", profile.clinic_id)
        .eq("is_test", false)
        .gte("created_at", `${currentMonthStart}T00:00:00`),
    ]);

    if (statusRes.ok) {
      setWaStatus(statusRes.data);
    }

    if (cRes.error || !cRes.data) {
      setErrorMsg(cRes.error?.message || "Failed to load clinic settings");
      setLoading(false);
      return;
    }

    setClinic(cRes.data);
    loadedEnabledRef.current = cRes.data.whatsapp_enabled ?? false;
    setWhatsappEnabled(cRes.data.whatsapp_enabled ?? false);
    setDefaultTemplate(tRes.data || null);

    const usageCount = uRes.data?.messages_sent ?? 0;
    const logCount = mRes.count ?? 0;
    setMessagesSentThisMonth(Math.max(usageCount, logCount));

    setLoading(false);
  }

  // Connect WhatsApp handler
  // Call startWhatsAppSignup() DIRECTLY without any preceding await/delay so the popup is not blocked
  const handleConnect = () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setConnectError(null);
    setConnectInfo(null);
    setConnectStep("popup");

    const signupPromise = startWhatsAppSignup();

    signupPromise
      .then(async (result) => {
        if (!result.ok) {
          inFlightRef.current = false;
          setConnectStep("idle");

          if (result.error === "cancelled") {
            setConnectInfo("Connect cancel kiya.");
            toast({ description: "Connect cancel kiya.", type: "info" });
            return;
          }

          if (result.error === "timeout") {
            setConnectError("Signup time out ho gaya. Dobara try karein.");
            return;
          }

          const msg = result.message || "";
          if (msg.includes("not configured")) {
            setConnectError("WhatsApp signup configure nahi hai (Meta App ID missing).");
          } else if (msg.includes("without a WhatsApp phone number")) {
            setConnectError("Signup me koi WhatsApp phone number select nahi hua. Kripya number add karein.");
          } else if (msg.includes("ad-blocker") || msg.includes("SDK")) {
            setConnectError("Meta SDK load nahi ho paya. Ad-blocker check karein ya page refresh karein.");
          } else {
            setConnectError("Connect nahi ho paya, dobara try karein.");
          }
          return;
        }

        // Code expires in 30 seconds - immediately call connectWhatsApp
        setConnectStep("connecting");
        try {
          const connectRes = await connectWhatsApp({
            code: result.data.code,
            waba_id: result.data.waba_id,
            phone_number_id: result.data.phone_number_id,
            business_id: result.data.business_id,
            event: result.data.event,
          });

          if (!connectRes.ok) {
            const errReason = connectRes.reason;
            const errMsg = connectRes.error || "";

            if (
              errReason === "already_connected" ||
              errMsg.includes("already connected") ||
              errMsg.includes("23505")
            ) {
              setConnectError("Ye number pehle se kisi aur clinic se juda hai.");
            } else if (errReason === "code_invalid") {
              setConnectError("Code expire ho gaya. Kripya dobara try karein.");
            } else if (errReason === "waba_not_authorized") {
              setConnectError("WhatsApp account authorize nahi ho paya. Dobara try karein.");
            } else if (errReason === "phone_not_in_waba") {
              setConnectError("Chuna gaya number WhatsApp account me nahi mila.");
            } else {
              setConnectError("Connect nahi ho paya, dobara try karein.");
            }
            return;
          }

          success("WhatsApp number safaltapoorvak connect ho gaya!");
          await refreshAfterConnectionChange();
        } catch {
          setConnectError("Connect nahi ho paya, dobara try karein.");
        } finally {
          inFlightRef.current = false;
          setConnectStep("idle");
        }
      })
      .catch(() => {
        inFlightRef.current = false;
        setConnectStep("idle");
        setConnectError("Connect nahi ho paya, dobara try karein.");
      });
  };

  async function handleDisconnect() {
    setDisconnecting(true);
    const res = await disconnectWhatsApp();
    setDisconnecting(false);
    setDisconnectDialogOpen(false);

    if (!res.ok) {
      toastError(res.error || "Disconnect nahi ho paya.", "Disconnect Failed");
      return;
    }

    success("WhatsApp disconnect ho gaya.");
    await refreshAfterConnectionChange();
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!clinic) return;

    setSubmitting(true);
    setErrorMsg(null);

    // Never write a stale value: if the server's whatsapp_enabled is no longer what this page loaded
    // (e.g. connecting a number just switched automatic sending off), show the real value and stop.
    const { data: fresh, error: freshError } = await supabase
      .from("clinics")
      .select("whatsapp_enabled")
      .eq("id", clinic.id)
      .single();
    if (freshError || !fresh) {
      setErrorMsg(freshError?.message || "Could not check the current WhatsApp setting. Please try again.");
      setSubmitting(false);
      return;
    }
    const serverEnabled = fresh.whatsapp_enabled ?? false;
    if (serverEnabled !== loadedEnabledRef.current) {
      loadedEnabledRef.current = serverEnabled;
      setWhatsappEnabled(serverEnabled);
      toast({
        description: "Setting server par badal chuki thi. Ab sahi value dikha di hai, dobara check karke Save karein.",
        type: "info",
      });
      setSubmitting(false);
      return;
    }

    const { error } = await supabase
      .from("clinics")
      .update({ whatsapp_enabled: whatsappEnabled })
      .eq("id", clinic.id);

    if (error) {
      setErrorMsg(error.message);
      toastError(error.message, "Save Failed");
      setSubmitting(false);
      return;
    }

    success("WhatsApp settings updated.");
    setSubmitting(false);
    loadAllData();
  }

  async function handleSendTestMessage() {
    if (!MOBILE_RE.test(testPhoneNumber)) return;

    setSendingTest(true);
    const result = await sendTestMessage(testPhoneNumber);
    setSendingTest(false);

    if (!result.ok) {
      toastError(result.error, "Test Message Failed");
      return;
    }
    if (!result.data.success) {
      toastError(result.data.error_message || "Unknown error from Meta", `Send Failed (${result.data.error_code ?? "no code"})`);
      return;
    }
    success(`Test message sent to ${testPhoneNumber}.`);
  }

  function formatConnectedDate(isoString: string | null | undefined): string {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return isoString;
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const status = waStatus?.status;
  const isConnected = status === "connected";
  const isNeedsReconnect = status === "needs_reconnect";
  const isError = status === "error";
  const isNeverOrDisconnected = !waStatus || status === "disconnected";

  const isConnecting = connectStep !== "idle";
  const sdkLoading = sdkStatus === "loading";

  const isPhoneSet = Boolean(waStatus?.phone_number_id || clinic?.waba_phone_number_id?.trim());
  const isTemplateApproved = Boolean(defaultTemplate);

  const quota = clinic?.monthly_message_quota ?? 3000;

  return (
    <div className="flex flex-col gap-6">
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Header with Subtitle Quota Line */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-medium text-foreground">WhatsApp Configuration</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage automated recall messaging settings and Meta connection state •{" "}
            <span className="font-medium text-foreground">
              {messagesSentThisMonth.toLocaleString()} of {quota.toLocaleString()} messages used this month
            </span>
          </p>
        </div>
      </div>

      {/* Main WhatsApp Connection Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                WhatsApp
              </CardTitle>
              <CardDescription className="mt-0.5">
                Meta Embedded Signup dwara apna WhatsApp business number connect karein
              </CardDescription>
            </div>

            {isConnected && (
              <Badge variant="outline" className="border-emerald-200 text-emerald-800 bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400 w-fit">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-700 dark:text-emerald-400" />
                Connected
              </Badge>
            )}
            {isNeedsReconnect && (
              <Badge variant="outline" className="border-amber-200 text-amber-800 bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 w-fit">
                <AlertTriangle className="h-3.5 w-3.5 mr-1 text-amber-700 dark:text-amber-400" />
                Needs Reconnect
              </Badge>
            )}
            {isError && (
              <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 w-fit">
                <AlertCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                Error
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Active Flow Banner: popup open */}
          {connectStep === "popup" && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <span>Meta window khuli hai... Kripya Meta popup me login karein aur apna number verify karein.</span>
            </div>
          )}

          {/* Active Flow Banner: connecting code */}
          {connectStep === "connecting" && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <span>Connect ho raha hai... Clinic se WhatsApp joda ja raha hai.</span>
            </div>
          )}

          {/* Neutral Info Banner (e.g. cancelled) */}
          {connectInfo && (
            <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{connectInfo}</span>
            </div>
          )}

          {/* Connect Flow Error with Retry Button */}
          {connectError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{connectError}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleConnect}
                disabled={isConnecting || sdkLoading}
                className="shrink-0 h-7 text-xs border-destructive/40 hover:bg-destructive/10"
              >
                Dobara try karein
              </Button>
            </div>
          )}

          {/* 1. Never connected / disconnected */}
          {isNeverOrDisconnected && (
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                Apne clinic ka WhatsApp number jodo. Reminder isi number se patients ko jayenge.
              </p>

              <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-2">
                <span className="text-xs font-medium text-foreground block">Aage kya hoga:</span>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
                  <li>Meta ki window khulegi</li>
                  <li>Apna number chuno aur verify karo</li>
                  <li>Wapas yahan aao</li>
                </ol>
              </div>

              <div>
                <Button
                  type="button"
                  onClick={handleConnect}
                  disabled={isConnecting || sdkLoading}
                  className="w-full sm:w-auto"
                >
                  {connectStep === "popup" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Meta window khuli hai...
                    </>
                  ) : connectStep === "connecting" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Connect ho raha hai...
                    </>
                  ) : sdkLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Meta ready ho raha hai...
                    </>
                  ) : (
                    "Connect WhatsApp"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* 2. Connected */}
          {isConnected && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-emerald-200 text-emerald-800 bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-700 dark:text-emerald-400" />
                    Connected
                  </Badge>
                  {waStatus?.connected_at && (
                    <span className="text-xs text-muted-foreground">
                      Connected on {formatConnectedDate(waStatus.connected_at)}
                    </span>
                  )}
                </div>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setDisconnectDialogOpen(true)}
                  disabled={disconnecting || isConnecting}
                  className="w-full sm:w-auto"
                >
                  Disconnect
                </Button>
              </div>

              {/* Number/IDs ONLY if getWhatsAppStatus() returns them */}
              {(waStatus?.phone_number_id || waStatus?.waba_id) && (
                <div className="grid gap-3 sm:grid-cols-2 text-xs">
                  {waStatus.phone_number_id && (
                    <div className="rounded-lg border border-border bg-card p-3 space-y-0.5">
                      <span className="text-muted-foreground block text-[11px]">Phone Number ID</span>
                      <span className="font-mono font-medium text-foreground text-xs break-all">
                        {waStatus.phone_number_id}
                      </span>
                    </div>
                  )}
                  {waStatus.waba_id && (
                    <div className="rounded-lg border border-border bg-card p-3 space-y-0.5">
                      <span className="text-muted-foreground block text-[11px]">WhatsApp Business Account (WABA) ID</span>
                      <span className="font-mono font-medium text-foreground text-xs break-all">
                        {waStatus.waba_id}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 5. Payment note (always visible when connected) */}
              <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-1.5 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="font-medium text-foreground">{WHATSAPP_PAYMENT_UNKNOWN_MESSAGE}</span>
                  <a
                    href="https://business.facebook.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium w-fit"
                  >
                    Open WhatsApp Manager
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <p className="text-muted-foreground">
                  Meta me message bhejne ke liye payment method jodna zaroori hai.
                </p>
              </div>
            </div>
          )}

          {/* 3. needs_reconnect */}
          {isNeedsReconnect && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-600/30 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="font-medium">WhatsApp dobara connect karna padega</p>
                </div>
              </div>

              {/* Show existing IDs if available */}
              {(waStatus?.phone_number_id || waStatus?.waba_id) && (
                <div className="grid gap-3 sm:grid-cols-2 text-xs">
                  {waStatus.phone_number_id && (
                    <div className="rounded-lg border border-border bg-card p-3 space-y-0.5">
                      <span className="text-muted-foreground block text-[11px]">Phone Number ID</span>
                      <span className="font-mono font-medium text-foreground text-xs break-all">
                        {waStatus.phone_number_id}
                      </span>
                    </div>
                  )}
                  {waStatus.waba_id && (
                    <div className="rounded-lg border border-border bg-card p-3 space-y-0.5">
                      <span className="text-muted-foreground block text-[11px]">WhatsApp Business Account (WABA) ID</span>
                      <span className="font-mono font-medium text-foreground text-xs break-all">
                        {waStatus.waba_id}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Button
                  type="button"
                  onClick={handleConnect}
                  disabled={isConnecting || sdkLoading}
                  className="w-full sm:w-auto"
                >
                  {connectStep === "popup" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Meta window khuli hai...
                    </>
                  ) : connectStep === "connecting" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Connect ho raha hai...
                    </>
                  ) : sdkLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Meta ready ho raha hai...
                    </>
                  ) : (
                    "Reconnect"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* 4. error */}
          {isError && (
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                <div>
                  <p className="font-medium">
                    {waStatus?.last_error ? waStatus.last_error : "WhatsApp connection me error aaya hai."}
                  </p>
                </div>
              </div>

              <div>
                <Button
                  type="button"
                  onClick={handleConnect}
                  disabled={isConnecting || sdkLoading}
                  className="w-full sm:w-auto"
                >
                  {connectStep === "popup" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Meta window khuli hai...
                    </>
                  ) : connectStep === "connecting" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Connect ho raha hai...
                    </>
                  ) : sdkLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Meta ready ho raha hai...
                    </>
                  ) : (
                    "Reconnect"
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <DialogHeader>
          <DialogTitle>Disconnect WhatsApp?</DialogTitle>
          <DialogDescription className="text-left pt-2 text-sm text-muted-foreground">
            WhatsApp disconnect karne par patients ko automatic reminders aur messages jana band ho jayenge jab tak aap ise dobara connect nahi karte.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDisconnectDialogOpen(false)}
            disabled={disconnecting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Disconnecting...
              </>
            ) : (
              "Disconnect"
            )}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* WhatsApp Controls & Test Message Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Message Sending Controls</CardTitle>
          <CardDescription>Configure automated recall sending and test message options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="c-wa-enabled"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                  disabled={isConnecting || disconnecting}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <Label htmlFor="c-wa-enabled" className="cursor-pointer font-medium text-sm">
                  Enable Automated WhatsApp Recall Sending
                </Label>
              </div>
              {/* 6. One-line note */}
              <p className="text-xs text-muted-foreground pl-7">
                Automatic reminders tab ON karna jab WhatsApp template approve ho jaye.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 text-xs text-muted-foreground border-t border-border pt-4">
              <div>
                <span className="font-medium text-foreground block mb-0.5">Scheduled Daily Send Time</span>
                <span>{clinic?.send_time || "10:00:00"} IST</span>
              </div>
              <div>
                <span className="font-medium text-foreground block mb-0.5">Daily Message Cap</span>
                <span>{clinic?.daily_message_cap ?? 150} messages per day</span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={submitting || isConnecting || disconnecting}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Save Settings
              </Button>
            </div>
          </form>

          {/* Test Message Section */}
          <div className="border-t border-border pt-6 space-y-3">
            <div>
              <Label htmlFor="test-phone-input" className="text-sm font-medium">Send Test Message</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Send a sample recall message using your clinic's default template.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-md">
              <Input
                id="test-phone-input"
                placeholder="e.g. 9876543210"
                value={testPhoneNumber}
                onChange={(e) => setTestPhoneNumber(e.target.value)}
                className="text-xs"
                disabled={sendingTest}
              />

              {isPhoneSet && isTemplateApproved ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={sendingTest || !MOBILE_RE.test(testPhoneNumber)}
                  onClick={handleSendTestMessage}
                >
                  {sendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Send Test Message
                </Button>
              ) : (
                <Tooltip content="Requires both a WABA Phone Number ID and an approved default template to be configured first.">
                  <span className="inline-block">
                    <Button type="button" variant="outline" size="sm" disabled className="w-full sm:w-auto">
                      Send Test Message
                    </Button>
                  </span>
                </Tooltip>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
