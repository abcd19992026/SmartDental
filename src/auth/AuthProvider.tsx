import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

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
  // Avoids acting on a stale async profile fetch after a newer auth event has already landed.
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;

    async function loadProfile(nextSession: Session | null, id: number) {
      if (!nextSession) {
        if (active && id === requestId.current) {
          setSession(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", nextSession.user.id)
        .single();

      if (!active || id !== requestId.current) return;

      if (error || !data) {
        // Deactivated users are excluded by RLS's is_active filter inside the helper
        // functions, so a missing profile row here also covers "deactivated while this
        // session was alive" -- treat both as the same clean, explained sign-out.
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setNotice("This account has been deactivated. Please contact your administrator.");
        setLoading(false);
        return;
      }

      if (!data.is_active) {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setNotice("This account has been deactivated. Please contact your administrator.");
        setLoading(false);
        return;
      }

      setSession(nextSession);
      setProfile(data);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      const id = ++requestId.current;
      loadProfile(data.session, id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const id = ++requestId.current;
      if (event === "SIGNED_OUT") {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      loadProfile(nextSession, id);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

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
