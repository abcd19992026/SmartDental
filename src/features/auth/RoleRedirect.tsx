import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { FullPageSpinner } from "@/components/FullPageSpinner";

/** Sends a logged-in user to the shell matching their role. */
export function RoleRedirect() {
  const { session, profile, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!session || !profile) {
    // index.html mounts the app on "/" whenever a Supabase token is in localStorage, but that
    // token can be stale. A visitor on "/" with no valid session gets the landing page, not /login.
    if (pathname === "/") return <ShowStaticLanding />;
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={profile.role === "super_admin" ? "/admin" : "/app"} replace />;
}

/** Reveals the static landing markup in index.html (hidden while <html data-app> is set). */
function ShowStaticLanding() {
  useEffect(() => {
    document.documentElement.removeAttribute("data-app");
    return () => document.documentElement.setAttribute("data-app", "");
  }, []);
  return null;
}
