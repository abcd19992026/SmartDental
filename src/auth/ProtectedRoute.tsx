import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/auth/useAuth";
import { FullPageSpinner } from "@/components/FullPageSpinner";
import type { UserRole } from "@/types/roles";

export function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: ReactNode;
}) {
  const { session, profile, realProfile, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!session || !profile || !realProfile) return <Navigate to="/login" replace />;

  // Access is decided by the real signed-in role, never the impersonated one -- otherwise a
  // super_admin impersonating a receptionist would get bounced from /admin with no way back. A
  // super_admin can always reach every route (mirrors their unrestricted DB-level access via
  // is_super_admin() in RLS), which is also what lets "Open Panel" land them on /app.
  const hasAccess =
    realProfile.role === "super_admin" || allowedRoles.some((role) => role === realProfile.role);
  if (!hasAccess) return <Navigate to="/" replace />;

  return <>{children}</>;
}
