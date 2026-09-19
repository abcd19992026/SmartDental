// Google AI Studio / Generative Language API (generativelanguage.googleapis.com), the legacy
// generateContent REST endpoint -- NOT Vertex AI (different auth, service-account based, which
// would tie this project to a GCP service account instead of the single AI Studio API key it
// already has). generateContent is confirmed (ai.google.dev/gemini-api/docs/migrate-to-
// interactions, fetched while building this) to remain fully supported even though Google's
// newer "Interactions API" is now the docs site's featured path for new projects; generateContent
// was kept here because its request/response shape is the long-stable, unambiguous one, and this
// project's one Gemini call is exactly the kind of single-turn, no-history request it was always
// built for. Docs consulted while building this file: ai.google.dev/gemini-api/docs/audio,
// ai.google.dev/gemini-api/docs/generate-content/audio, ai.google.dev/gemini-api/docs/structured-
// output and .../generate-content/structured-output, plus a live smoke-tested call against the
// real endpoint (see the phase verification report) to confirm the exact field names below.
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface MedicineOption {
  name: string;
  default_dosage: string | null;
  default_duration: string | null;
}

/** The model's raw (untrusted) structured output -- already coerced to the right JS types, but
 * NOT yet validated against the clinic's real medicine list. See matchMedicines in index.ts for
 * the step that turns `medicines` (model-claimed names) into DB-verified {name, dosage,
 * duration} triples. */
export interface ModelDictationOutput {
  chief_complaint: string | null;
  oral_examination: string | null;
  provisional_diagnosis: string | null;
  treatment_plan: string | null;
  advice: string | null;
  medicines: string[];
  unmatched_medicines: string[];
}

export type GeminiCallResult =
  | { ok: true; output: ModelDictationOutput }
  | { ok: false; reason: string };

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    chief_complaint: { type: "string", nullable: true },
    oral_examination: { type: "string", nullable: true },
    provisional_diagnosis: { type: "string", nullable: true },
    treatment_plan: { type: "string", nullable: true },
    advice: { type: "string", nullable: true },
    medicines: { type: "array", items: { type: "string" } },
    unmatched_medicines: { type: "array", items: { type: "string" } },
  },
  required: ["medicines", "unmatched_medicines"],
};

/** Builds the system instruction establishing the speaker, the language-in/English-out rule, the
 * "empty field is correct" rule, and the medicine vocabulary constraint -- see phase spec 3.5.
 * medicineNames is the clinic's own active medicines.name list ONLY (never default_dosage/
 * default_duration -- those are deliberately withheld from the model so it can never invent or
 * alter a dosage/duration; the Edge Function attaches the real DB values after matching). */
function buildSystemInstruction(medicineNames: string[]): string {
  const vocabulary = medicineNames.length > 0
    ? medicineNames.map((n) => `- ${n}`).join("\n")
    : "(this clinic has no medicines configured yet -- treat the list as empty)";

  return [
    "You are assisting a dentist in India who is dictating clinical notes immediately after",
    "treating a patient. The dictation may be in Hindi, English, or a mix of both (Hinglish).",
    "",
    "Produce every output field in English, using standard clinical/dental terminology, no matter",
    "what language the input was in.",
    "",
    "Fill a field only with what the speaker actually said. An empty or null field is correct and",
    "expected when that topic was not mentioned -- never invent, never pad, never infer a",
    "plausible diagnosis, examination finding, or treatment that was not spoken.",
    "",
    "This clinic's allowed medicine names are:",
    vocabulary,
    "",
    'For "medicines", return only names copied from that exact list -- match what was said to the',
    "closest entry on the list. If a spoken medicine does not clearly match anything on the list,",
    'do not put it in "medicines" -- instead put what you heard, transliterated/anglicized, into',
    '"unmatched_medicines". Never substitute a different medicine from the list as a guess.',
    "",
    "Never return tooth numbers, vitals (height, weight, blood pressure, SpO2), medication",
    "dosages, or medication durations in any field -- those are out of scope for you and are",
    "handled elsewhere from the clinic's own records.",
  ].join("\n");
}

function buildUserContext(patientAge?: number, patientSex?: string): string {
  const hints: string[] = [];
  if (patientAge !== undefined) hints.push(`patient age ~${patientAge}`);
  if (patientSex) hints.push(`patient sex ${patientSex}`);

  const hintLine = hints.length > 0
    ? `For context only, do not repeat these in your output: ${hints.join(", ")}.`
    : "";

  return [
    "Listen to the attached audio recording of a dentist's spoken consultation notes and fill in",
    "the structured fields accordingly.",
    hintLine,
  ].filter(Boolean).join("\n");
}

/** The one call this project makes to Gemini: audio in, structured JSON out, in a single request
 * -- no separate speech-to-text step. Never logs the audio, the request body, or the model's
 * text output; a failure is reported back only as an opaque `reason` tag. */
export async function callGeminiDictation(params: {
  apiKey: string;
  model: string;
  audioBase64: string;
  mimeType: string;
  medicineNames: string[];
  patientAge?: number;
  patientSex?: string;
}): Promise<GeminiCallResult> {
  const requestBody = {
    system_instruction: { parts: [{ text: buildSystemInstruction(params.medicineNames) }] },
    contents: [
      {
        role: "user",
        parts: [
          { text: buildUserContext(params.patientAge, params.patientSex) },
          { inline_data: { mime_type: params.mimeType, data: params.audioBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let response: Response;
  try {
    response = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(params.model)}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": params.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  if (!response.ok) {
    // Deliberately not reading/logging the response body -- Gemini error bodies can echo back
    // request content, and this function's privacy rule (3.9) is "never log the model's text
    // output, not even on the error path."
    return { ok: false, reason: `http_${response.status}` };
  }

  const data = await response.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    return { ok: false, reason: "no_output" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "invalid_json" };
  }

  // Untrusted model output -- coerced to expected shape only, nothing here is trusted as-is.
  // Medicine-name verification against the clinic's real list happens one layer up, in index.ts.
  const p = parsed as Record<string, unknown>;
  const asStringOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
  const asStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

  return {
    ok: true,
    output: {
      chief_complaint: asStringOrNull(p.chief_complaint),
      oral_examination: asStringOrNull(p.oral_examination),
      provisional_diagnosis: asStringOrNull(p.provisional_diagnosis),
      treatment_plan: asStringOrNull(p.treatment_plan),
      advice: asStringOrNull(p.advice),
      medicines: asStringArray(p.medicines),
      unmatched_medicines: asStringArray(p.unmatched_medicines),
    },
  };
}
