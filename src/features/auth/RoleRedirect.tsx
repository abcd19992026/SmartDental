import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { FullPageSpinner } from "@/components/FullPageSpinner";

/** Sends a logged-in user to the shell matching their role. */
export function RoleRedirect() {
  const { session, profile, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!session || !profile) return <Navigate to="/login" replace />;

  return <Navigate to={profile.role === "super_admin" ? "/admin" : "/app"} replace />;
}
