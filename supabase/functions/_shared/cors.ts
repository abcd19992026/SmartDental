// Restricts responses to the app's own origin, not "*" -- these functions perform
// security-sensitive admin actions (creating clinics, resetting passwords, activating/
// deactivating users), so no other site should be able to have a signed-in super admin's
// browser call them cross-origin. Set via `supabase secrets set APP_ORIGIN=https://your-app`
// for each environment; falls back to the local Vite dev port so local testing works out of
// the box.
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "http://localhost:5173";

const SHARED_HEADERS = {
  // "x-hub-signature-256" and "x-cron-secret" added for the Phase 5A functions (webhook
  // signature verification, cron auth); GET added because Meta's webhook verification handshake
  // is a GET request. Neither addition widens what any function actually accepts -- each function
  // still enforces its own method allowlist -- this only affects what a browser preflight is told
  // is available.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  ...SHARED_HEADERS,
};

// Origins allowed to echo back via corsHeadersForRequest, for functions actually exercised from
// a local dev server as well as production (browser-invoked, owner/super_admin-triggered actions)
// -- as opposed to the static single-origin `corsHeaders` above, which is the right default for
// functions a browser is never expected to call locally.
const ALLOWED_ORIGINS = [APP_ORIGIN, "http://localhost:5173"];

/** Per-request CORS headers: echoes the caller's own Origin back only when it's in
 * ALLOWED_ORIGINS, so both the production frontend and local dev get a matching
 * Access-Control-Allow-Origin instead of the single static value `corsHeaders` sends. An
 * unrecognized Origin (or none, e.g. a non-browser caller) falls back to APP_ORIGIN, never to a
 * wildcard or to reflecting an arbitrary origin -- this stays exactly as restrictive as
 * `corsHeaders`, just origin-aware. */
export function corsHeadersForRequest(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : APP_ORIGIN;
  return { "Access-Control-Allow-Origin": allowOrigin, ...SHARED_HEADERS };
}
