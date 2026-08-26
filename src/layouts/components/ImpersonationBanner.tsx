import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { supabase } from "@/lib/supabase";

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** One thin accent line shown above the topbar while a super_admin is viewing the clinic app as
 * another profile -- deliberately minimal so the rest of the impersonated view stays faithful
 * to what that user actually sees. */
export function ImpersonationBanner() {
  const { profile, isImpersonating, stopImpersonation } = useAuth();
  const navigate = useNavigate();
  const [clinicName, setClinicName] = useState<string | null>(null);

  const clinicId = profile?.clinic_id ?? null;

  useEffect(() => {
    if (!isImpersonating || !clinicId) {
      setClinicName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("clinics")
      .select("name")
      .eq("id", clinicId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setClinicName(data?.name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [isImpersonating, clinicId]);

  if (!isImpersonating || !profile) return null;

  function handleExit() {
    stopImpersonation();
    navigate(clinicId ? `/admin/clinics/${clinicId}` : "/admin/clinics");
  }

  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-3 bg-amber-500 px-4 text-xs font-medium text-amber-950">
      <span className="truncate">
        {clinicName || "Clinic"} — viewing as {profile.full_name || "Unknown user"} (
        {roleLabel(profile.role)})
      </span>
      <button
        type="button"
        onClick={handleExit}
        className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 hover:bg-amber-600/30"
      >
        <LogOut className="h-3 w-3" />
        Exit
      </button>
    </div>
  );
}
