import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";

interface ClinicSubscription {
  is_active: boolean;
  plan_expires_on: string | null;
}

export function useClinicSubscription() {
  const { profile } = useAuth();
  const [subscription, setSubscription] = useState<ClinicSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!profile?.clinic_id) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("clinics")
      .select("is_active, plan_expires_on")
      .eq("id", profile.clinic_id)
      .single();
    setSubscription(data);
    setLoading(false);
  }, [profile?.clinic_id]);

  useEffect(() => {
    setLoading(true);
    refetch();
  }, [refetch]);

  // Picks up a newly-expired (or newly-reactivated) plan on a long-idle tab without requiring
  // a full page reload.
  useEffect(() => {
    function onFocus() {
      refetch();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  return { subscription, loading };
}
