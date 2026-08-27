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

  // 21A-2: widened from 09:00-20:00 to 07:00-20:00 IST -- stage 2's earliest possible clamp
  // target is 07:00 (a patient due at 08:00 must still get their reminder), so the window has to
  // open early enough to reach it. One window, applies to every stage.
  if (hour < 7 || hour >= 20) {
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

  // 21A-2: every eligible clinic is processed on every tick inside the window now, not just the
  // one hour matching its own send_time. That per-hour filter used to be how each clinic got
  // processed exactly once a day; under the new ladder it would also silently gate stage 2 (which
  // fires at an arbitrary per-recall instant -- due_time minus 2 hours -- with no relationship to
  // send_time at all) and it would break the catch-up guarantee (a missed tick would mean waiting
  // a full day, not "next tick this same day"). send_time still matters -- it's just now read
  // per-recall inside processClinic, to gate stages 1 ("day_before") and 3 ("follow_up") only.
  // Idempotency (never sending the same stage twice) is enforced downstream by the atomic
  // last_stage_sent claim in sendOneRecallMessage, so re-scanning an already-sent recall on every
  // tick is safe, just a cheap extra query.
  const results = [];
  for (const clinic of clinics ?? []) {
    const clinicSendHour = parseInt(String(clinic.send_time).split(":")[0], 10);
    try {
      results.push(await processClinic(serviceClient, clinic, dateStr, hour, clinicSendHour, accessToken));
    } catch (err) {
      console.error(`Unhandled error processing clinic ${clinic.id}`, err);
      results.push({ clinic_id: clinic.id, clinic_name: clinic.name, sent: 0, failed: 0, skipped_reason: "unhandled_error" });
    }
  }

  return json({ ist_hour: hour, ist_date: dateStr, results }, 200);
});
