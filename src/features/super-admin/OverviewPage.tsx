import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, AlertOctagon, Clock, MessageSquare, CreditCard, AlertTriangle, ChevronRight } from "lucide-react";
import { getPlatformOverview, getClinicsList, type PlatformOverview, type ClinicListRow } from "@/lib/admin-api";
import { daysUntilIST } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OverviewPage() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [clinics, setClinics] = useState<ClinicListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      const [ovRes, clRes] = await Promise.all([getPlatformOverview(), getClinicsList()]);

      if (ovRes.ok === false) {
        setError(ovRes.error);
        setLoading(false);
        return;
      }
      setOverview(ovRes.data);

      if (clRes.ok === true) {
        setClinics(clRes.data);
      }
      setLoading(false);
    }

    loadData();
  }, []);

  const expiringClinics = clinics
    .filter((c) => c.plan_expires_on && daysUntilIST(c.plan_expires_on) <= 30 && daysUntilIST(c.plan_expires_on) >= 0)
    .sort((a, b) => daysUntilIST(a.plan_expires_on!) - daysUntilIST(b.plan_expires_on!));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium text-foreground">Platform Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Key metrics and active clinic monitoring</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stat Cards Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} size="sm">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">Total Clinics</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-foreground">{overview?.total_clinics ?? 0}</div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">Active</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-foreground">{overview?.active_clinics ?? 0}</div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">Suspended</CardTitle>
                <AlertOctagon className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-foreground">{overview?.suspended_clinics ?? 0}</div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">Expiring (30d)</CardTitle>
                <Clock className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-foreground">{overview?.expiring_within_30_days ?? 0}</div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">Messages (Month)</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-foreground">{overview?.messages_sent_this_month ?? 0}</div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">Payments (Month)</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-foreground">₹{overview?.payments_this_month ?? 0}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Two Lists Below */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* List 1: Expiring Soon */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              Clinics Expiring Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : expiringClinics.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <p className="text-sm text-muted-foreground">No clinics expiring in the next 30 days.</p>
                <Link to="/admin/clinics" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
                  View all clinics
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {expiringClinics.map((c) => {
                  const days = daysUntilIST(c.plan_expires_on!);
                  return (
                    <div key={c.id} className="flex items-center justify-between py-3">
                      <div>
                        <Link to={`/admin/clinics/${c.id}`} className="font-medium text-foreground hover:underline">
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{c.city || "No city"}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="border-amber-600/30 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40">
                          {days === 0 ? "Expires today" : `${days} days remaining`}
                        </Badge>
                        <Link
                          to={`/admin/clinics/${c.id}`}
                          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* List 2: Failed Messages (Phase 5 Placeholder) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Failed Messages (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">No clinics with message failures in the last 7 days.</p>
              <Link to="/admin/messages" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
                View message log
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
