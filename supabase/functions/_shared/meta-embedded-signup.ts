import { GRAPH_API_VERSION } from "./whatsapp-graph-api.ts";

// Server-side calls for WhatsApp Embedded Signup. Nothing in here ever logs a URL, a request body or
// a token: query strings carry the app secret / the one-time code, so errors are reduced to Meta's
// own error code + message before they leave this module.

const GRAPH = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export type GraphResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: number | null; message: string; httpStatus: number };

async function graphCall<T>(url: string, init: RequestInit): Promise<GraphResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, code: null, message: "Could not reach Meta", httpStatus: 0 };
  }
  const body = await response.json().catch(() => null);
  if (response.ok && body && !body.error) {
    return { ok: true, data: body as T };
  }
  return {
    ok: false,
    code: typeof body?.error?.code === "number" ? body.error.code : null,
    message: typeof body?.error?.message === "string" ? body.error.message : `Graph API returned HTTP ${response.status}`,
    httpStatus: response.status,
  };
}

function bearer(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

/** Embedded Signup `code` -> business (system user) token. The code lives 30 seconds and is single-use. */
export function exchangeCodeForToken(appId: string, appSecret: string, code: string) {
  const qs = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
  return graphCall<{ access_token: string; expires_in?: number }>(`${GRAPH}/oauth/access_token?${qs}`, { method: "GET" });
}

export interface DebugTokenData {
  app_id?: string;
  is_valid?: boolean;
  /** Unix seconds; 0 means the token never expires. */
  expires_at?: number;
  data_access_expires_at?: number;
  granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
}

export async function debugToken(appId: string, appSecret: string, inputToken: string): Promise<GraphResult<DebugTokenData>> {
  const qs = new URLSearchParams({ input_token: inputToken });
  const result = await graphCall<{ data: DebugTokenData }>(`${GRAPH}/debug_token?${qs}`, {
    method: "GET",
    headers: bearer(`${appId}|${appSecret}`),
  });
  if (!result.ok) return result;
  if (!result.data?.data) return { ok: false, code: null, message: "debug_token returned no data", httpStatus: 200 };
  return { ok: true, data: result.data.data };
}

/** debug_token's expires_at (unix seconds, 0 = never) -> ISO string, or null for "never". */
export function expiryToIso(expiresAt: number | undefined): string | null {
  return expiresAt && expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : null;
}

/** True when the token's granular scopes grant a WhatsApp permission on exactly this WABA. */
export function tokenCoversWaba(data: DebugTokenData, wabaId: string): boolean {
  return (data.granular_scopes ?? []).some(
    (g) =>
      (g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging") &&
      (g.target_ids ?? []).includes(wabaId),
  );
}

export async function listWabaPhoneNumberIds(wabaId: string, token: string): Promise<GraphResult<string[]>> {
  const result = await graphCall<{ data?: Array<{ id: string }> }>(`${GRAPH}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id&limit=100`, {
    method: "GET",
    headers: bearer(token),
  });
  if (!result.ok) return result;
  return { ok: true, data: (result.data.data ?? []).map((p) => p.id) };
}

export function getPhoneNumberInfo(phoneNumberId: string, token: string) {
  return graphCall<{ id: string; is_on_biz_app?: boolean; platform_type?: string }>(
    `${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=is_on_biz_app,platform_type`,
    { method: "GET", headers: bearer(token) },
  );
}

export function subscribeApp(wabaId: string, token: string) {
  return graphCall<{ success: boolean }>(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: bearer(token),
  });
}

export function unsubscribeApp(wabaId: string, token: string) {
  return graphCall<{ success: boolean }>(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "DELETE",
    headers: bearer(token),
  });
}

/** Cloud API registration + two-step PIN. NOT used for coexistence numbers (already registered). */
export function registerPhoneNumber(phoneNumberId: string, token: string, pin: string) {
  return graphCall<{ success: boolean }>(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/register`, {
    method: "POST",
    headers: { ...bearer(token), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
}

/** Coexistence: ask WhatsApp to start the one-time contacts / history sync (allowed once, within 24 h). */
export function requestSmbAppDataSync(phoneNumberId: string, token: string, syncType: "smb_app_state_sync" | "history") {
  return graphCall<{ messaging_product?: string; request_id?: string }>(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/smb_app_data`, {
    method: "POST",
    headers: { ...bearer(token), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
  });
}

/** Documented refresh for expiring system-user tokens (Meta "Install Apps, Generate, Refresh, and
 * Revoke Tokens"). NOT confirmed to work for Embedded Signup business tokens -- see
 * refresh-whatsapp-tokens, which only calls this when explicitly enabled or probed. */
export function refreshSystemUserToken(appId: string, appSecret: string, currentToken: string) {
  const qs = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: currentToken,
    set_token_expires_in_60_days: "true",
  });
  return graphCall<{ access_token: string }>(`${GRAPH}/oauth/access_token?${qs}`, { method: "GET" });
}

/** Cryptographically random 6-digit two-step verification PIN. */
export function generatePin(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}
