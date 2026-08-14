import { useEffect, useState } from "react";
import { Shield, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { daysUntilIST, formatDateIST } from "@/lib/dates";
import type { Database } from "@/types/database.types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ClinicRow = Database["public"]["Tables"]["clinics"]["Row"];

export function SubscriptionTab() {
  const { profile } = useAuth();
  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptionInfo();
  }, []);

  async function loadSubscriptionInfo() {
    if (!profile?.clinic_id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("id", profile.clinic_id)
      .single();

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    setClinic(data);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const daysLeft = clinic?.plan_expires_on ? daysUntilIST(clinic.plan_expires_on) : null;

  return (
    <div className="flex flex-col gap-6">
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Subscription Status (Read-Only) */}
      <Card className="border-muted bg-muted/20">
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Subscription & License (Read-Only)
          </CardTitle>
          <CardDescription>
            Subscription dates and message quotas are managed by the platform operator.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground block">Current Plan</span>
            <span className="font-medium capitalize text-foreground">{clinic?.plan_name || "Standard"}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Plan Started On</span>
            <span className="font-medium text-foreground">
              {clinic?.plan_started_on ? formatDateIST(clinic.plan_started_on) : "—"}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Plan Expires On</span>
            <span className="font-medium text-foreground">
              {clinic?.plan_expires_on ? formatDateIST(clinic.plan_expires_on) : "—"}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Days Remaining</span>
            <span className={`font-medium ${daysLeft !== null && daysLeft <= 30 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {daysLeft !== null ? `${daysLeft} days` : "—"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
