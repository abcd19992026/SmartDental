import { useEffect, useState, type FormEvent } from "react";
import { MessageSquare, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { todayIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];
type TemplateRow = Database["public"]["Tables"]["whatsapp_templates"]["Row"];

export function WhatsAppTab() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();

  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [defaultTemplate, setDefaultTemplate] = useState<TemplateRow | null>(null);
  const [messagesSentThisMonth, setMessagesSentThisMonth] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");

  useEffect(() => {
    loadWhatsappSettings();
  }, [profile?.clinic_id]);

  async function loadWhatsappSettings() {
    if (!profile?.clinic_id) return;
    setLoading(true);
    setErrorMsg(null);

    const todayStr = todayIST();
    const currentMonthStart = `${todayStr.substring(0, 7)}-01`;

    const [cRes, tRes, uRes, mRes] = await Promise.all([
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
        .gte("created_at", `${currentMonthStart}T00:00:00`),
    ]);

    if (cRes.error || !cRes.data) {
      setErrorMsg(cRes.error?.message || "Failed to load clinic settings");
      setLoading(false);
      return;
    }

    setClinic(cRes.data);
    setWhatsappEnabled(cRes.data.whatsapp_enabled ?? false);
    setDefaultTemplate(tRes.data || null);

    // Calculate monthly messages sent: use clinic_usage count or message_log fallback count
    const usageCount = uRes.data?.messages_sent ?? 0;
    const logCount = mRes.count ?? 0;
    setMessagesSentThisMonth(Math.max(usageCount, logCount));

    setLoading(false);
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!clinic) return;

    setSubmitting(true);
    setErrorMsg(null);

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
    loadWhatsappSettings();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Prerequisite checks
  const isPhoneSet = Boolean(clinic?.waba_phone_number_id?.trim());
  const isTemplateApproved = Boolean(defaultTemplate);
  const isEnabled = Boolean(whatsappEnabled);

  const missingRequirements: string[] = [];
  if (!isPhoneSet) missingRequirements.push("WABA Phone Number ID is not configured");
  if (!isTemplateApproved) missingRequirements.push("An approved default WhatsApp template is missing");
  if (!isEnabled) missingRequirements.push("Automated WhatsApp sending is turned off");

  const isFullyConnected = isPhoneSet && isTemplateApproved && isEnabled;

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

        <div>
          {isFullyConnected ? (
            <Badge variant="outline" className="border-emerald-600/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600 dark:text-emerald-400" />
              Automated Sending Active
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-600/30 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40">
              <AlertCircle className="h-3.5 w-3.5 mr-1 text-amber-600 dark:text-amber-400" />
              Setup Incomplete
            </Badge>
          )}
        </div>
      </div>

      {/* Connection State Readiness Card */}
      <Card className={isFullyConnected ? "border-emerald-600/30 bg-emerald-50/20 dark:bg-emerald-950/10" : "border-amber-600/30 bg-amber-50/20 dark:bg-amber-950/10"}>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            WhatsApp Connection Status
          </CardTitle>
          <CardDescription>
            Automated recall messages require all 3 configuration requirements to be active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Requirement 1: Phone Number ID */}
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              {isPhoneSet ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-foreground block">1. WABA Phone Number ID</span>
                <span className="text-xs text-muted-foreground block">
                  {isPhoneSet ? `ID: ${clinic?.waba_phone_number_id}` : "Not set (Requires platform setup)"}
                </span>
              </div>
            </div>

            {/* Requirement 2: Default Template */}
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              {isTemplateApproved ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-foreground block">2. Approved Default Template</span>
                <span className="text-xs text-muted-foreground block">
                  {isTemplateApproved && defaultTemplate ? defaultTemplate.meta_template_name : "No approved default template"}
                </span>
              </div>
            </div>

            {/* Requirement 3: WhatsApp Enabled */}
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              {isEnabled ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-foreground block">3. Automated Sending</span>
                <span className="text-xs text-muted-foreground block">
                  {isEnabled ? "Enabled" : "Disabled in clinic settings"}
                </span>
              </div>
            </div>
          </div>

          {/* Missing Requirements Alert Banner */}
          {missingRequirements.length > 0 && (
            <div className="rounded-lg border border-amber-600/30 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2 font-medium mb-1 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                Automated messaging will not run until resolved:
              </div>
              <ul className="list-disc list-inside space-y-1 ml-1 text-muted-foreground dark:text-amber-200/80">
                {missingRequirements.map((req, idx) => (
                  <li key={idx}>{req}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* WhatsApp Controls & Test Message Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Message Sending Controls</CardTitle>
          <CardDescription>Configure automated recall sending and test message options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="c-wa-enabled"
                checked={whatsappEnabled}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <Label htmlFor="c-wa-enabled" className="cursor-pointer font-medium text-sm">
                Enable Automated WhatsApp Recall Sending
              </Label>
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
              <Button type="submit" size="sm" disabled={submitting}>
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
                disabled
              />

              <Tooltip content="Test message endpoint is not yet available. Test sending will be enabled once the backend test-send endpoint is deployed.">
                <span className="inline-block">
                  <Button type="button" variant="outline" size="sm" disabled className="w-full sm:w-auto">
                    Send Test Message
                  </Button>
                </span>
              </Tooltip>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
