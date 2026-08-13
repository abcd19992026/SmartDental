import { createContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const AUTH_TIMEOUT_MS = 10_000;

export interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Set when the user was signed out for a reason they should be told about. */
  notice: string | null;
  clearNotice: () => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

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
        setProfile(null);
        setLoading(false);
        return;
      }
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        setProfile(null);
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
          setProfile(null);
          setNotice("No profile found for this account. Contact support.");
          return;
        }

        if (!data.is_active) {
          await supabase.auth.signOut();
          if (cancelled) return;
          setSession(null);
          setProfile(null);
          setNotice("This account has been deactivated. Please contact your administrator.");
          return;
        }

        setProfile(data);
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
        setProfile(null);
        setNotice("Something went wrong loading your account. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

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
      setProfile(null);
      setLoading(false);
    }, AUTH_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [loading]);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  function clearNotice() {
    setNotice(null);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, notice, clearNotice, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
