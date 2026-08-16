import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { timingSafeEqual } from "../_shared/timing-safe-equal.ts";
import { getIstNow } from "../_shared/ist-time.ts";
import { processClinic } from "./send.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // This function must never be publicly callable: its URL is discoverable, and an unprotected
  // endpoint would let anyone drain a clinic's monthly message quota (real money) by hitting it
  // repeatedly. There is deliberately no Supabase-JWT path here (see config.toml verify_jwt =
  // false for this function) -- the cron secret is the only gate.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("X-Cron-Secret");
  if (!cronSecret || !providedSecret || !timingSafeEqual(providedSecret, cronSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  if (!accessToken) {
    console.error("META_ACCESS_TOKEN is not configured");
    return json({ error: "Server misconfigured" }, 500);
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { hour, dateStr } = getIstNow();

  // Hard send-window guard, independent of any clinic's configured send_time: never send before
  // 9 AM or after 8 PM IST. A misconfigured send_time must be skipped, not honoured.
  if (hour < 9 || hour >= 20) {
    console.log(`Outside send window (IST hour ${hour}); nothing sent`);
    return json({ ist_hour: hour, ist_date: dateStr, message: "Outside send window", results: [] }, 200);
  }

  const { data: clinics, error: clinicsError } = await serviceClient
    .from("clinics")
    .select("id, name, phone, waba_phone_number_id, send_time, daily_message_cap, monthly_message_quota")
    .eq("whatsapp_enabled", true)
    .eq("is_active", true)
    .gte("plan_expires_on", dateStr);

  if (clinicsError) {
    console.error("Failed to load eligible clinics", clinicsError);
    return json({ error: clinicsError.message }, 500);
  }

  // The cron fires hourly; each clinic is only processed in the hour matching its own
  // send_time -- this is what makes per-clinic send times work without one job per clinic.
  const dueClinics = (clinics ?? []).filter((clinic) => {
    const sendHour = parseInt(String(clinic.send_time).split(":")[0], 10);
    return sendHour === hour;
  });

  const results = [];
  for (const clinic of dueClinics) {
    try {
      results.push(await processClinic(serviceClient, clinic, dateStr, accessToken));
    } catch (err) {
      console.error(`Unhandled error processing clinic ${clinic.id}`, err);
      results.push({ clinic_id: clinic.id, clinic_name: clinic.name, sent: 0, failed: 0, skipped_reason: "unhandled_error" });
    }
  }

  return json({ ist_hour: hour, ist_date: dateStr, results }, 200);
});
