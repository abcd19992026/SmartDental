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
  const { session, profile, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  if (!allowedRoles.some((role) => role === profile.role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
