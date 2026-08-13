import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { getClinicsList, type ClinicListRow } from "@/lib/admin-api";
import { daysUntilIST, formatDateIST } from "@/lib/dates";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ClinicsListPage() {
  const navigate = useNavigate();
  const [clinics, setClinics] = useState<ClinicListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "expiring">("all");

  useEffect(() => {
    async function loadClinics() {
      setLoading(true);
      setError(null);
      const res = await getClinicsList();
      if (res.ok === false) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setClinics(res.data);
      setLoading(false);
    }
    loadClinics();
  }, []);

  const filteredClinics = clinics.filter((c) => {
    // Search check
    const searchLower = search.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(searchLower) ||
      (c.city && c.city.toLowerCase().includes(searchLower)) ||
      (c.owner_name && c.owner_name.toLowerCase().includes(searchLower));

    if (!matchesSearch) return false;

    // Status filter
    if (statusFilter === "active") return c.is_active;
    if (statusFilter === "suspended") return !c.is_active;
    if (statusFilter === "expiring") {
      if (!c.plan_expires_on) return false;
      const days = daysUntilIST(c.plan_expires_on);
      return days >= 0 && days <= 30;
    }
    return true;
  });

  function getStatusDot(clinic: ClinicListRow) {
    if (!clinic.is_active) {
      return <span className="h-2 w-2 rounded-full bg-destructive inline-block" title="Suspended" />;
    }
    if (!clinic.plan_expires_on) {
      return <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" title="Active" />;
    }
    const days = daysUntilIST(clinic.plan_expires_on);
    if (days < 0) {
      return <span className="h-2 w-2 rounded-full bg-destructive inline-block" title="Expired" />;
    }
    if (days <= 30) {
      return <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" title="Expiring soon" />;
    }
    return <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" title="Active" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header with primary action */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-foreground">Clinics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage registered dental clinics and subscriptions</p>
        </div>
        <Link to="/admin/clinics/new" className={cn(buttonVariants({ variant: "default" }))}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Clinic
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by clinic name or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Button
            variant={statusFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("all")}
          >
            All
          </Button>
          <Button
            variant={statusFilter === "active" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("active")}
          >
            Active
          </Button>
          <Button
            variant={statusFilter === "suspended" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("suspended")}
          >
            Suspended
          </Button>
          <Button
            variant={statusFilter === "expiring" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("expiring")}
          >
            Expiring Soon
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredClinics.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-sm text-muted-foreground">No clinics found matching your filter criteria.</p>
              <Link to="/admin/clinics/new" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Clinic
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Clinic Name</th>
                    <th className="py-3 px-4">City</th>
                    <th className="py-3 px-4">Owner</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Plan Expiry</th>
                    <th className="py-3 px-4 text-right">Patients</th>
                    <th className="py-3 px-4 text-right">Messages</th>
                    <th className="py-3 px-4 text-center">WhatsApp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredClinics.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/admin/clinics/${c.id}`)}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          {getStatusDot(c)}
                          <span>{c.name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">{c.city || "—"}</td>
                      <td className="py-3.5 px-4 text-foreground">{c.owner_name || "—"}</td>
                      <td className="py-3.5 px-4">
                        {c.is_active ? (
                          <Badge variant="outline" className="border-emerald-600/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10">
                            Suspended
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {c.plan_expires_on ? formatDateIST(c.plan_expires_on) : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right text-foreground">{c.patients_count}</td>
                      <td className="py-3.5 px-4 text-right text-foreground">{c.messages_sent_this_month}</td>
                      <td className="py-3.5 px-4 text-center">
                        {c.whatsapp_configured ? (
                          <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5">
                            Yes
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
