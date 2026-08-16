// Restricts responses to the app's own origin, not "*" -- these functions perform
// security-sensitive admin actions (creating clinics, resetting passwords, activating/
// deactivating users), so no other site should be able to have a signed-in super admin's
// browser call them cross-origin. Set via `supabase secrets set APP_ORIGIN=https://your-app`
// for each environment; falls back to the local Vite dev port so local testing works out of
// the box.
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "http://localhost:5173";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  // "x-hub-signature-256" and "x-cron-secret" added for the Phase 5A functions (webhook
  // signature verification, cron auth); GET added because Meta's webhook verification handshake
  // is a GET request. Neither addition widens what any function actually accepts -- each function
  // still enforces its own method allowlist -- this only affects what a browser preflight is told
  // is available.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
