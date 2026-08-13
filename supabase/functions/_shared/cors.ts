// Restricts responses to the app's own origin, not "*" -- these functions perform
// security-sensitive admin actions (creating clinics, resetting passwords, activating/
// deactivating users), so no other site should be able to have a signed-in super admin's
// browser call them cross-origin. Set via `supabase secrets set APP_ORIGIN=https://your-app`
// for each environment; falls back to the local Vite dev port so local testing works out of
// the box.
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "http://localhost:5173";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
