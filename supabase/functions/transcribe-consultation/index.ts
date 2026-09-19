import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getIstNow, combineIstInstant } from "../_shared/ist-time.ts";
import { callGeminiDictation, type MedicineOption } from "../_shared/gemini-api.ts";
import { validateTranscribeConsultationRequest } from "./validate.ts";

// Phase 11A -- AI voice dictation. Audio in (base64, in memory for the duration of this request
// only), structured JSON out. Never writes to prescriptions/visits, never stores audio, never
// stores the transcript or the model's text output anywhere (not the DB, not console.log). The
// only DB write here is exactly one ai_usage_log row per request that gets past authorization.

// ---------------------------------------------------------------------------
// CORS -- deliberately NOT the shared corsHeadersForRequest (cors.ts), which falls back to a
// localhost default when APP_ORIGIN is unset. This function fails closed instead: no APP_ORIGIN
// means no response headers and no request processed, since a misconfigured origin here would
// mean a billable, quota-consuming AI call is one step away from being reachable from anywhere.
// ---------------------------------------------------------------------------
const APP_ORIGIN = Deno.env.get("APP_ORIGIN");
const ALLOWED_ORIGINS = APP_ORIGIN ? [APP_ORIGIN, "http://localhost:5173"] : [];

function buildCorsHeaders(req: Request): Record<string, string> | null {
  if (!APP_ORIGIN) return null;
  const origin = req.headers.get("Origin");
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResp(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function errorResp(code: string, message: string, status: number, cors: Record<string, string>): Response {
  return jsonResp({ ok: false, code, message }, status, cors);
}

// The phase spec's written default was "gemini-2.5-flash"; live-tested against the real API
// while building this (see the verification report), Google now rejects that model for new
// callers with "no longer available to new users... use models/gemini-3.6-flash", so that is the
// fallback here instead. GEMINI_MODEL still overrides this without a code change either way.
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";
const MAX_FIELD_CHARS = 2000;
const MAX_MEDICINE_ITEMS = 50;
const MAX_MEDICINE_NAME_CHARS = 200;
const MAX_DURATION_SECONDS = 200;

/** Matches the model's claimed medicine names against the clinic's real medicines table --
 * exact, then case-insensitive, then trimmed+case-insensitive, per phase spec 3.6. A name that
 * doesn't match a real row is moved to unmatched, never passed through unverified. dosage/
 * duration always come from the matched DB row, never from the model. */
function matchMedicines(
  claimedNames: string[],
  modelUnmatched: string[],
  clinicMedicines: MedicineOption[],
): { medicines: Array<{ name: string; dosage: string | null; duration: string | null }>; unmatched: string[] } {
  const byExact = new Map(clinicMedicines.map((m) => [m.name, m]));
  const byCi = new Map(clinicMedicines.map((m) => [m.name.toLowerCase(), m]));
  const byCiTrimmed = new Map(clinicMedicines.map((m) => [m.name.trim().toLowerCase(), m]));

  const medicines: Array<{ name: string; dosage: string | null; duration: string | null }> = [];
  const unmatched: string[] = [...modelUnmatched];

  for (const claimed of claimedNames.slice(0, MAX_MEDICINE_ITEMS)) {
    const name = claimed.slice(0, MAX_MEDICINE_NAME_CHARS);
    const match = byExact.get(name) ?? byCi.get(name.toLowerCase()) ?? byCiTrimmed.get(name.trim().toLowerCase());
    if (match) {
      medicines.push({ name: match.name, dosage: match.default_dosage, duration: match.default_duration });
    } else {
      unmatched.push(name);
    }
  }

  return { medicines, unmatched: unmatched.slice(0, MAX_MEDICINE_ITEMS).map((n) => n.slice(0, MAX_MEDICINE_NAME_CHARS)) };
}

function capField(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, MAX_FIELD_CHARS);
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (!cors) {
    // Fail closed: server misconfigured (APP_ORIGIN missing). No CORS headers, no processing.
    return new Response(JSON.stringify({ ok: false, code: "SERVER_MISCONFIGURED", message: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResp("METHOD_NOT_ALLOWED", "Method not allowed", 405, cors);

  // Steps 1-2: verified JWT via an anon-key client's auth.getUser() -- never trust a bearer token
  // without this round-trip. Same two steps as _shared/auth.ts's verifyBearerToken, duplicated
  // (not imported) because this route's role set (owner/receptionist/super_admin) and its six
  // distinct error codes don't match any existing exported gate.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResp("UNAUTHENTICATED", "Missing Authorization header", 401, cors);
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return errorResp("UNAUTHENTICATED", "Missing Authorization header", 401, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const anonClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  if (userError || !userData.user) {
    return errorResp("UNAUTHENTICATED", "Invalid or expired token", 401, cors);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Step 3: profile row is the ONLY source of clinic_id/branch_id -- the request body's clinic_id
  // (if present at all) is never read, let alone trusted, anywhere in this function.
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role, is_active, clinic_id, branch_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  const allowedRoles = new Set(["owner", "receptionist", "super_admin"]);
  if (profileError || !profile || !profile.is_active || !allowedRoles.has(profile.role)) {
    return errorResp("FORBIDDEN", "Owner, receptionist, or super admin access required", 403, cors);
  }

  // A super_admin profile has no clinic_id (chk_super_admin_no_clinic) -- there is no clinic to
  // bill or check quota against, so this is handled the same as "no usable clinic" below rather
  // than inventing a 7th error code the phase spec doesn't define.
  const clinicId = profile.clinic_id as string | null;
  const { data: clinic } = clinicId
    ? await serviceClient
        .from("clinics")
        .select("id, is_active, plan_expires_on, ai_dictation_enabled, ai_dictation_monthly_cap_seconds")
        .eq("id", clinicId)
        .maybeSingle()
    : { data: null };

  const { dateStr } = getIstNow();
  if (!clinic || !clinic.is_active || (clinic.plan_expires_on !== null && clinic.plan_expires_on < dateStr)) {
    return errorResp("CLINIC_INACTIVE", "This clinic is inactive or its plan has expired", 403, cors);
  }

  if (!clinic.ai_dictation_enabled) {
    return errorResp("NOT_ENABLED", "AI dictation is not enabled for this clinic", 403, cors);
  }

  // Month-to-date quota, current IST calendar month, success-only -- matches the phase spec's
  // quota rule exactly. Computed before the audio itself is even parsed, since it depends only
  // on stored usage, not on this request's payload.
  const monthStartIso = combineIstInstant(`${dateStr.slice(0, 7)}-01`, "00:00:00").toISOString();
  const { data: usageRows } = await serviceClient
    .from("ai_usage_log")
    .select("audio_seconds")
    .eq("clinic_id", clinic.id)
    .eq("status", "success")
    .gte("created_at", monthStartIso);
  const usedSeconds = (usageRows ?? []).reduce((sum, r) => sum + (r.audio_seconds ?? 0), 0);
  if (usedSeconds >= clinic.ai_dictation_monthly_cap_seconds) {
    return errorResp("QUOTA_EXCEEDED", "This clinic has reached its monthly AI dictation quota", 429, cors);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const input = validateTranscribeConsultationRequest(body);

  // logUsage below is the single write point for ai_usage_log -- every branch past this point
  // (BAD_AUDIO included) goes through it exactly once, per phase spec 3.8. audio_seconds is
  // clamped to the 200s ceiling even for a request that claimed a longer duration.
  async function logUsage(status: "success" | "failed", audioSeconds: number, failReason: string | null, model: string | null) {
    const clamped = Math.max(0, Math.min(MAX_DURATION_SECONDS, Math.round(audioSeconds)));
    await serviceClient.from("ai_usage_log").insert({
      clinic_id: clinic!.id,
      branch_id: profile.branch_id,
      user_id: userData.user.id,
      audio_seconds: clamped,
      status,
      fail_reason: failReason,
      model,
    });
  }

  if (!input) {
    await logUsage("failed", 0, "BAD_AUDIO", null);
    return errorResp("BAD_AUDIO", "Audio is missing, the wrong mime type, too large, or too long", 400, cors);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    // Server-side misconfiguration, never the caller's fault -- logged the same as any other
    // post-authorization failure (3.8: "success and failure both").
    console.error(`transcribe-consultation misconfigured: GEMINI_API_KEY not set (clinic ${clinic.id})`);
    await logUsage("failed", input.duration_seconds, "SERVER_MISCONFIGURED", null);
    return errorResp("SERVER_MISCONFIGURED", "Server misconfigured", 500, cors);
  }

  // Medicine names only -- default_dosage/default_duration are fetched here so they can be
  // attached from the DB after matching, but are never sent to the model (3.5/3.6).
  const { data: medicineRows } = await serviceClient
    .from("medicines")
    .select("name, default_dosage, default_duration")
    .eq("clinic_id", clinic.id)
    .eq("is_active", true)
    .order("name");
  const clinicMedicines: MedicineOption[] = medicineRows ?? [];

  const result = await callGeminiDictation({
    apiKey,
    model: GEMINI_MODEL,
    audioBase64: input.audio_base64,
    mimeType: input.mime_type,
    medicineNames: clinicMedicines.map((m) => m.name),
    patientAge: input.patient_age,
    patientSex: input.patient_sex,
  });

  if (!result.ok) {
    // Never log result.reason's underlying detail beyond this coarse tag -- it must never carry
    // model output text (see callGeminiDictation's own comment on this).
    console.error(`transcribe-consultation model call failed for clinic ${clinic.id}: ${result.reason}`);
    await logUsage("failed", input.duration_seconds, `MODEL_ERROR:${result.reason}`, GEMINI_MODEL);
    return errorResp("MODEL_ERROR", "The AI service could not process this recording", 502, cors);
  }

  const { medicines, unmatched } = matchMedicines(result.output.medicines, result.output.unmatched_medicines, clinicMedicines);

  await logUsage("success", input.duration_seconds, null, GEMINI_MODEL);

  return jsonResp(
    {
      ok: true,
      fields: {
        chief_complaint: capField(result.output.chief_complaint),
        oral_examination: capField(result.output.oral_examination),
        provisional_diagnosis: capField(result.output.provisional_diagnosis),
        treatment_plan: capField(result.output.treatment_plan),
        advice: capField(result.output.advice),
      },
      medicines,
      unmatched_medicines: unmatched,
    },
    200,
    cors,
  );
});
