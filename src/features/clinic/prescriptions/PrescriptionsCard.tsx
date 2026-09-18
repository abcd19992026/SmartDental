import { useEffect, useState } from "react";
import { ClipboardPlus, Pencil } from "lucide-react";
import { fetchPrescriptionsForPatient, type PrescriptionRow } from "@/lib/clinic-api";
import { formatDateIST } from "@/lib/dates";
import { useAuth } from "@/auth/useAuth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SendPrescriptionButton } from "@/features/clinic/prescriptions/SendPrescriptionButton";
import { EditPrescriptionModal } from "@/features/clinic/prescriptions/EditPrescriptionModal";

interface PrescriptionsCardProps {
  patientId: string;
  /** Bumped by the parent (e.g. after AddVisitModal's onSuccess) to trigger a reload. */
  refreshKey?: number;
  /** For the edit modal's tooth chart layout. Defaults to "adult" when unknown. */
  dentitionType?: "adult" | "child";
}

export function PrescriptionsCard({ patientId, refreshKey, dentitionType }: PrescriptionsCardProps) {
  const { profile } = useAuth();
  // Matches AddVisitModal's canPrescribe gate -- editing a prescription is owner/super_admin
  // only (prescriptions_update RLS), so a receptionist never sees a button that would just fail.
  const canEditRx = profile?.role === "owner" || profile?.role === "super_admin";

  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Bumped after a successful edit to force a reload independent of the parent's own refreshKey.
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPrescriptionsForPatient(patientId).then((res) => {
      if (!active) return;
      if (res.ok) setPrescriptions(res.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, refreshKey, localRefreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <ClipboardPlus className="h-4 w-4 text-primary" />
          Prescriptions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : prescriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No prescriptions recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {prescriptions.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {formatDateIST(p.prescribed_on)}
                    {p.provisional_diagnosis && (
                      <span className="text-muted-foreground font-normal"> · {p.provisional_diagnosis}</span>
                    )}
                  </div>
                  {/* doctor_name is printed exactly as stored -- no "Dr." prefix added here. The
                     dentist may or may not have typed one themselves when prescribing. */}
                  <div className="text-xs text-muted-foreground">{p.doctor_name}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs shrink-0"
                    onClick={() => window.open(`/app/prescriptions/${p.id}/print`, "_blank", "noopener,noreferrer")}
                  >
                    View
                  </Button>
                  {canEditRx && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs shrink-0"
                      onClick={() => setEditingId(p.id)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                  )}
                  <SendPrescriptionButton prescriptionId={p.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <EditPrescriptionModal
        open={editingId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingId(null);
        }}
        prescriptionId={editingId}
        dentitionType={dentitionType}
        onSuccess={() => setLocalRefreshKey((k) => k + 1)}
      />
    </Card>
  );
}
