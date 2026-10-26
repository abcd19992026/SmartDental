import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { isGraphAuthError } from "./whatsapp-graph-api.ts";

export type WaCredentialSource = "clinic" | "global";

export type WaCredentials =
  | { ok: true; source: WaCredentialSource; accessToken: string; phoneNumberId: string }
  | { ok: false; reason: string; status: string | null };

/**
 * Which token + phone number a clinic sends with. A clinic with a `connected` row in
 * clinic_whatsapp_connections uses ITS OWN token and number. A clinic with no row at all keeps the
 * old behaviour exactly (global META_ACCESS_TOKEN + clinics.waba_phone_number_id). A clinic whose
 * row is needs_reconnect / disconnected / error must NOT send -- and must never fall back to the
 * global token, which would send from the wrong WhatsApp account.
 */
export async function resolveWhatsappCredentials(
  serviceClient: SupabaseClient,
  clinicId: string,
  clinicPhoneNumberId: string | null,
): Promise<WaCredentials> {
  const { data: conn, error } = await serviceClient
    .from("clinic_whatsapp_connections")
    .select("status, phone_number_id")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) {
    console.error(`Credential lookup failed for clinic ${clinicId}: ${error.message}`);
    return { ok: false, reason: "connection_lookup_failed", status: null };
  }

  if (!conn) {
    const globalToken = Deno.env.get("META_ACCESS_TOKEN");
    if (!globalToken) {
      console.error("META_ACCESS_TOKEN is not configured");
      return { ok: false, reason: "no_global_token", status: null };
    }
    if (!clinicPhoneNumberId) {
      return { ok: false, reason: "no_phone_number_id", status: null };
    }
    return { ok: true, source: "global", accessToken: globalToken, phoneNumberId: clinicPhoneNumberId };
  }

  if (conn.status !== "connected") {
    return { ok: false, reason: `connection_${conn.status}`, status: conn.status };
  }

  const { data: token, error: tokenError } = await serviceClient.rpc("get_clinic_whatsapp_token", {
    p_clinic_id: clinicId,
  });
  if (tokenError || typeof token !== "string" || token.length === 0) {
    console.error(`Token unavailable for clinic ${clinicId}`);
    return { ok: false, reason: "token_unavailable", status: "connected" };
  }
  return { ok: true, source: "clinic", accessToken: token, phoneNumberId: conn.phone_number_id };
}

/** HTTP error body for a failed resolveWhatsappCredentials() in the owner/receptionist-triggered
 * senders (the cron just skips the clinic instead). */
export function describeCredentialFailure(
  creds: Extract<WaCredentials, { ok: false }>,
): { status: number; body: { error: string; error_code?: string } } {
  if (creds.reason === "no_phone_number_id") {
    return { status: 400, body: { error: "This clinic has no WABA phone number configured" } };
  }
  if (creds.status !== null) {
    return {
      status: 400,
      body: {
        error: "WhatsApp is not connected for this clinic. Please reconnect WhatsApp in Settings.",
        error_code: "WHATSAPP_NEEDS_RECONNECT",
      },
    };
  }
  return { status: 500, body: { error: "Server misconfigured" } };
}

/** Writes one `whatsapp_send_skipped` row per clinic per 24 h -- the cron runs every 15 minutes, so
 * logging every tick would bury the audit log. Never throws. */
export async function logSendSkippedOnce(
  serviceClient: SupabaseClient,
  clinicId: string,
  reason: string,
  status: string | null,
): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await serviceClient
      .from("activity_log")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("action", "whatsapp_send_skipped")
      .gte("created_at", since)
      .limit(1);
    if (existing && existing.length > 0) return;

    await serviceClient.from("activity_log").insert({
      clinic_id: clinicId,
      user_id: null,
      action: "whatsapp_send_skipped",
      entity_type: "whatsapp_connection",
      entity_id: clinicId,
      meta: { actor_type: "system", reason, connection_status: status },
    });
  } catch (err) {
    console.error(`Could not write whatsapp_send_skipped for clinic ${clinicId}`, err);
  }
}

/** Flips a `connected` row to needs_reconnect (and audits it). Guarded on status = 'connected' so
 * a second call, or a row that is already something else, is a no-op. Never throws. */
export async function markConnectionNeedsReconnect(
  serviceClient: SupabaseClient,
  clinicId: string,
  message: string,
  extraMeta: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: updated } = await serviceClient
      .from("clinic_whatsapp_connections")
      .update({ status: "needs_reconnect", last_error: message })
      .eq("clinic_id", clinicId)
      .eq("status", "connected")
      .select("clinic_id")
      .maybeSingle();
    if (!updated) return;

    await serviceClient.from("activity_log").insert({
      clinic_id: clinicId,
      user_id: null,
      action: "whatsapp_needs_reconnect",
      entity_type: "whatsapp_connection",
      entity_id: clinicId,
      meta: { actor_type: "system", reason: message, ...extraMeta },
    });
  } catch (err) {
    console.error(`Could not mark clinic ${clinicId} needs_reconnect`, err);
  }
}

/** Call after any failed Graph API send. If Meta says the CLINIC'S OWN token is dead (error 190),
 * the connection is marked needs_reconnect. A failure on the shared global token is not the
 * clinic's connection, so it never touches clinic_whatsapp_connections. */
export async function noteGraphAuthFailure(
  serviceClient: SupabaseClient,
  clinicId: string,
  source: WaCredentialSource | undefined,
  errorCode: string | null,
): Promise<void> {
  if (source !== "clinic" || !isGraphAuthError(errorCode)) return;
  await markConnectionNeedsReconnect(serviceClient, clinicId, "Meta rejected the access token (error 190). Please reconnect WhatsApp.", {
    meta_error_code: errorCode,
  });
}
