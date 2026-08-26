import { createContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const AUTH_TIMEOUT_MS = 10_000;

// sessionStorage (not localStorage) so an impersonation session never survives a browser
// restart -- closing the tab drops it, a refresh keeps it.
const IMPERSONATE_STORAGE_KEY = "sd_impersonate_profile_id";

export interface AuthContextValue {
  session: Session | null;
  /** Effective profile: impersonatedProfile ?? realProfile. Every existing clinic_id/role/
   * branch_id call site reads this, so impersonation needs no changes to those call sites. */
  profile: Profile | null;
  /** Always the true signed-in profile, regardless of impersonation. Route guards must use
   * this, never `profile`, or a super_admin impersonating a receptionist would get locked out
   * of /admin. */
  realProfile: Profile | null;
  isImpersonating: boolean;
  startImpersonation: (profileId: string) => Promise<{ ok: boolean; error?: string }>;
  stopImpersonation: () => void;
  loading: boolean;
  /** Set when the user was signed out for a reason they should be told about. */
  notice: string | null;
  clearNotice: () => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [realProfile, setRealProfile] = useState<Profile | null>(null);
  const [impersonatedProfile, setImpersonatedProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  function clearImpersonation() {
    setImpersonatedProfile(null);
    sessionStorage.removeItem(IMPERSONATE_STORAGE_KEY);
  }

  // Sets up the initial session read and the change listener. The onAuthStateChange callback
  // MUST stay synchronous: Supabase's auth client holds an internal lock while that callback
  // runs, so awaiting any supabase.* call inside it (e.g. a profiles select) deadlocks and
  // never resolves. All it does here is mirror the session into state; the profile fetch lives
  // in a separate effect below, keyed on the resulting session's user id.
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        setSession(null);
        setRealProfile(null);
        clearImpersonation();
        setLoading(false);
        return;
      }
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        setRealProfile(null);
        clearImpersonation();
        setLoading(false);
        return;
      }
      setSession(nextSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Fetches the profile row whenever the signed-in user changes. Runs outside of
  // onAuthStateChange entirely, so it's free to await Supabase calls.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (cancelled) return;

        if (error || !data) {
          console.error("Failed to load profile for", userId, error);
          await supabase.auth.signOut();
          if (cancelled) return;
          setSession(null);
          setRealProfile(null);
          clearImpersonation();
          setNotice("No profile found for this account. Contact support.");
          return;
        }

        if (!data.is_active) {
          await supabase.auth.signOut();
          if (cancelled) return;
          setSession(null);
          setRealProfile(null);
          clearImpersonation();
          setNotice("This account has been deactivated. Please contact your administrator.");
          return;
        }

        setRealProfile(data);
      } catch (err) {
        console.error("Unexpected error loading profile for", userId, err);
        if (cancelled) return;
        try {
          await supabase.auth.signOut();
        } catch {
          // already signed out or network error signing out -- state is cleared below regardless
        }
        if (cancelled) return;
        setSession(null);
        setRealProfile(null);
        clearImpersonation();
        setNotice("Something went wrong loading your account. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // Restores an in-progress impersonation after a page refresh. Only ever runs once per real
  // profile load (guarded by the `impersonatedProfile` check, since startImpersonation also
  // sets it) and only for a super_admin -- if the signed-in user isn't one, any leftover key is
  // discarded rather than honoured, so a non-super_admin can never impersonate.
  useEffect(() => {
    if (!realProfile || impersonatedProfile) return;
    const storedId = sessionStorage.getItem(IMPERSONATE_STORAGE_KEY);
    if (!storedId) return;

    if (realProfile.role !== "super_admin") {
      sessionStorage.removeItem(IMPERSONATE_STORAGE_KEY);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", storedId)
        .single();
      if (cancelled) return;
      if (error || !data || data.role === "super_admin") {
        sessionStorage.removeItem(IMPERSONATE_STORAGE_KEY);
        return;
      }
      setImpersonatedProfile(data);
    })();

    return () => {
      cancelled = true;
    };
  }, [realProfile, impersonatedProfile]);

  // Final safety net: if auth resolution (session read + profile fetch) hasn't finished within
  // 10s -- e.g. a hung network request -- stop spinning and surface an explicit error instead
  // of leaving the app stuck on a loading screen forever. Re-arms any time loading flips back
  // to true, and is cleared the moment loading resolves through the normal paths above.
  useEffect(() => {
    if (!loading) return;
    const timeoutId = setTimeout(() => {
      console.error(`Auth resolution did not complete within ${AUTH_TIMEOUT_MS}ms`);
      setNotice("Could not verify your session. Please check your connection and try again.");
      setSession(null);
      setRealProfile(null);
      clearImpersonation();
      setLoading(false);
    }, AUTH_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [loading]);

  async function startImpersonation(profileId: string): Promise<{ ok: boolean; error?: string }> {
    if (realProfile?.role !== "super_admin") {
      return { ok: false, error: "Only a super admin can open a clinic panel as another user." };
    }

    const { data, error } = await supabase.from("profiles").select("*").eq("id", profileId).single();
    if (error || !data) {
      return { ok: false, error: error?.message || "User not found." };
    }
    // Mirrors the guard in admin-reset-password: never let a super_admin act as another
    // platform admin.
    if (data.role === "super_admin") {
      return { ok: false, error: "Cannot open a panel as another platform admin." };
    }

    setImpersonatedProfile(data);
    sessionStorage.setItem(IMPERSONATE_STORAGE_KEY, profileId);
    return { ok: true };
  }

  function stopImpersonation() {
    clearImpersonation();
  }

  async function signOut() {
    clearImpersonation();
    await supabase.auth.signOut();
    setSession(null);
    setRealProfile(null);
  }

  function clearNotice() {
    setNotice(null);
  }

  const profile = impersonatedProfile ?? realProfile;

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        realProfile,
        isImpersonating: impersonatedProfile !== null,
        startImpersonation,
        stopImpersonation,
        loading,
        notice,
        clearNotice,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
