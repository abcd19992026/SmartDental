import { useEffect, useState } from "react";
import { fetchClinicAiDictationStatus } from "@/lib/clinic-api";

// Module-level cache, keyed by clinic id -- fetched once per session, not once per mount/render.
// A page navigation away and back (e.g. ConsultationPage unmount/remount for a different
// patient) reuses the same cached value instead of re-hitting the DB every time.
const cache = new Map<string, boolean>();
const inFlight = new Map<string, Promise<boolean>>();

async function loadStatus(clinicId: string): Promise<boolean> {
  if (cache.has(clinicId)) return cache.get(clinicId)!;
  const existing = inFlight.get(clinicId);
  if (existing) return existing;

  const promise = fetchClinicAiDictationStatus(clinicId).then((result) => {
    const enabled = result.ok ? result.data.ai_dictation_enabled : false;
    cache.set(clinicId, enabled);
    inFlight.delete(clinicId);
    return enabled;
  });
  inFlight.set(clinicId, promise);
  return promise;
}

/** `enabled` is null while the first-ever check for this clinic in this session is in flight;
 * true/false once resolved (and instantly true/false on every subsequent mount, from cache). */
export function useDictationGate(clinicId: string | null | undefined): { enabled: boolean | null } {
  const [enabled, setEnabled] = useState<boolean | null>(clinicId ? (cache.get(clinicId) ?? null) : null);

  useEffect(() => {
    if (!clinicId) {
      setEnabled(null);
      return;
    }
    if (cache.has(clinicId)) {
      setEnabled(cache.get(clinicId)!);
      return;
    }
    let active = true;
    loadStatus(clinicId).then((value) => {
      if (active) setEnabled(value);
    });
    return () => {
      active = false;
    };
  }, [clinicId]);

  return { enabled };
}
