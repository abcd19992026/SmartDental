import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { timingSafeEqual } from "../_shared/timing-safe-equal.ts";
import { debugToken, expiryToIso, refreshSystemUserToken } from "../_shared/meta-embedded-signup.ts";
import { markConnectionNeedsReconnect } from "../_shared/whatsapp-connection.ts";

// Runs daily (pg_cron). For every connected clinic it asks Meta (debug_token) whether the token is
// still valid and when it expires, and keeps token_expires_at / last_checked_at current.
//
// REFRESH: Meta documents a refresh for expiring system-user tokens (GET /oauth/access_token with
// fb_exchange_token), but nothing confirms it works for Embedded Signup business tokens. So it is OFF
// until proven on a real connected token: send {"probe_clinic_id": "<uuid>"} once (with X-Cron-Secret)
// to try it for that clinic, then set WHATSAPP_TOKEN_REFRESH_ENABLED=true if it worked. While it is off
// (or if it fails), a token that expires within RECONNECT_WITHIN_DAYS is marked needs_reconnect so the
// owner re-runs Connect WhatsApp before sending breaks.
const CHECK_WITHIN_DAYS = 15;
const RECONNECT_WITHIN_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ConnectionRow {
  clinic_id: string;
  waba_id: string;
  token_expires_at: string | null;
}

type RefreshOutcome = { ok: true; expiresAt: string | null } | { ok: false; reason: string };

async function loadToken(serviceClient: SupabaseClient, clinicId: string): Promise<string | null> {
  const { data } = await serviceClient.rpc("get_clinic_whatsapp_token", { p_clinic_id: clinicId });
  return typeof data === "string" && data.length > 0 ? data : null;
}

/** Tries Meta's documented refresh. The new token replaces the old one ONLY after debug_token
 * confirms it is valid, belongs to our app and still covers this WABA -- otherwise the old token is left untouched. */
async function attemptRefresh(
  serviceClient: SupabaseClient,
  appId: string,
  appSecret: string,
  conn: ConnectionRow,
  currentToken: string,
): Promise<RefreshOutcome> {
  const refreshed = await refreshSystemUserToken(appId, appSecret, currentToken);
  if (!refreshed.ok) return { ok: false, reason: `Meta refused the refresh (code ${refreshed.code}): ${refreshed.message}`.slice(0, 300) };

  const newToken = refreshed.data.access_token;
  const check = await debugToken(appId, appSecret, newToken);
  if (!check.ok || check.data.is_valid !== true || check.data.app_id !== appId) {
    return { ok: false, reason: "The refreshed token did not pass debug_token" };
  }
  const covers = (check.data.granular_scopes ?? []).some((g) => (g.target_ids ?? []).includes(conn.waba_id));
  if (!covers) return { ok: false, reason: "The refreshed token no longer covers this WABA" };

  const { error: storeError } = await serviceClient.rpc("store_clinic_whatsapp_secret", {
    p_clinic_id: conn.clinic_id,
    p_kind: "token",
    p_secret: newToken,
  });
  if (storeError) return { ok: false, reason: "Could not store the refreshed token" };

  const expiresAt = expiryToIso(check.data.expires_at);
  await serviceClient
    .from("clinic_whatsapp_connections")
    .update({ token_expires_at: expiresAt, last_checked_at: new Date().toISOString(), last_error: null })
    .eq("clinic_id", conn.clinic_id);
  await serviceClient.from("activity_log").insert({
    clinic_id: conn.clinic_id,
    user_id: null,
    action: "whatsapp_token_refreshed",
    entity_type: "whatsapp_connection",
    entity_id: conn.clinic_id,
    meta: { actor_type: "system", new_token_expires_at: expiresAt },
  });
  return { ok: true, expiresAt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Cron only -- no Supabase-JWT path (verify_jwt = false), same constant-time check as send-recall-messages.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("X-Cron-Secret");
  if (!cronSecret || !providedSecret || !timingSafeEqual(providedSecret, cronSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appId || !appSecret) {
    console.error("META_APP_ID / META_APP_SECRET is not configured");
    return json({ error: "Server misconfigured" }, 500);
  }

  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let probeClinicId: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.probe_clinic_id === "string") probeClinicId = body.probe_clinic_id;
  } catch {
    // Empty body (the cron call) is normal.
  }

  // One-off probe: try the documented refresh on ONE real connection and report what Meta said.
  if (probeClinicId) {
    const { data: conn } = await serviceClient
      .from("clinic_whatsapp_connections")
      .select("clinic_id, waba_id, token_expires_at")
      .eq("clinic_id", probeClinicId)
      .eq("status", "connected")
      .maybeSingle();
    if (!conn) return json({ error: "No connected WhatsApp connection for that clinic" }, 404);
    const token = await loadToken(serviceClient, conn.clinic_id);
    if (!token) return json({ error: "No stored token for that clinic" }, 404);
    const outcome = await attemptRefresh(serviceClient, appId, appSecret, conn as ConnectionRow, token);
    return json({ probe: true, clinic_id: conn.clinic_id, refreshed: outcome.ok, ...(outcome.ok ? { new_expires_at: outcome.expiresAt } : { reason: outcome.reason }) }, 200);
  }

  const refreshEnabled = Deno.env.get("WHATSAPP_TOKEN_REFRESH_ENABLED") === "true";
  const { data: rows, error: rowsError } = await serviceClient
    .from("clinic_whatsapp_connections")
    .select("clinic_id, waba_id, token_expires_at")
    .eq("status", "connected");
  if (rowsError) {
    console.error("refresh-whatsapp-tokens: could not load connections");
    return json({ error: "Could not load connections" }, 500);
  }

  const results: Array<{ clinic_id: string; outcome: string }> = [];
  for (const conn of (rows ?? []) as ConnectionRow[]) {
    try {
      const token = await loadToken(serviceClient, conn.clinic_id);
      if (!token) {
        await markConnectionNeedsReconnect(serviceClient, conn.clinic_id, "The stored WhatsApp token is missing. Please reconnect WhatsApp.");
        results.push({ clinic_id: conn.clinic_id, outcome: "token_missing" });
        continue;
      }

      const check = await debugToken(appId, appSecret, token);
      if (!check.ok) {
        // Transient Meta/network trouble must not disconnect a clinic. Try again tomorrow.
        results.push({ clinic_id: conn.clinic_id, outcome: "check_failed" });
        continue;
      }
      if (check.data.is_valid !== true) {
        await markConnectionNeedsReconnect(serviceClient, conn.clinic_id, "Meta says the WhatsApp token is no longer valid. Please reconnect WhatsApp.");
        results.push({ clinic_id: conn.clinic_id, outcome: "token_invalid" });
        continue;
      }

      const expiresAt = expiryToIso(check.data.expires_at);
      await serviceClient
        .from("clinic_whatsapp_connections")
        .update({ token_expires_at: expiresAt, last_checked_at: new Date().toISOString() })
        .eq("clinic_id", conn.clinic_id);

      const daysLeft = expiresAt ? (new Date(expiresAt).getTime() - Date.now()) / DAY_MS : Infinity;
      if (daysLeft >= CHECK_WITHIN_DAYS) {
        results.push({ clinic_id: conn.clinic_id, outcome: "ok" });
        continue;
      }

      if (refreshEnabled) {
        const outcome = await attemptRefresh(serviceClient, appId, appSecret, conn, token);
        if (outcome.ok) {
          results.push({ clinic_id: conn.clinic_id, outcome: "refreshed" });
          continue;
        }
        console.error(`refresh-whatsapp-tokens: refresh failed for clinic ${conn.clinic_id}`);
      }

      if (daysLeft < RECONNECT_WITHIN_DAYS) {
        await markConnectionNeedsReconnect(
          serviceClient,
          conn.clinic_id,
          `The WhatsApp token expires in ${Math.max(0, Math.floor(daysLeft))} day(s). Please reconnect WhatsApp.`,
          { token_expires_at: expiresAt, refresh_enabled: refreshEnabled },
        );
        results.push({ clinic_id: conn.clinic_id, outcome: "needs_reconnect" });
      } else {
        results.push({ clinic_id: conn.clinic_id, outcome: "expiring_soon" });
      }
    } catch (err) {
      console.error(`refresh-whatsapp-tokens: unhandled error for clinic ${conn.clinic_id}`, err instanceof Error ? err.message : "unknown");
      results.push({ clinic_id: conn.clinic_id, outcome: "error" });
    }
  }

  return json({ refresh_enabled: refreshEnabled, checked: results.length, results }, 200);
});
