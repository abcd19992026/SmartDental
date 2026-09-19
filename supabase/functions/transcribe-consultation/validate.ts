// Audio mime types this function will accept from a browser MediaRecorder -- kept as an
// allowlist (not a bare "starts with audio/" check) since only these are realistic outputs of
// the recorder 11B will build, and letting through an arbitrary audio/* string here would mean
// forwarding an untested mime type straight into the Gemini call as inlineData.mimeType.
const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
]);

// 6 MB, matching the phase spec's cap. Base64 inflates raw bytes by ~4/3, so the base64 STRING
// length ceiling is derived from this, not compared against it directly.
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MAX_AUDIO_BASE64_CHARS = Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 4;
const MAX_DURATION_SECONDS = 200;

export interface TranscribeConsultationRequest {
  audio_base64: string;
  mime_type: string;
  duration_seconds: number;
  patient_age?: number;
  patient_sex?: string;
}

/** Returns the parsed request on success, or null if the audio itself is missing/invalid --
 * callers map a null return to BAD_AUDIO. Deliberately does NOT read/validate clinic_id: the
 * phase spec requires the request body's clinic_id (if present at all) to be ignored outright,
 * never even inspected, so there is no field for it here. */
export function validateTranscribeConsultationRequest(body: unknown): TranscribeConsultationRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (typeof b.audio_base64 !== "string" || b.audio_base64.length === 0) return null;
  if (b.audio_base64.length > MAX_AUDIO_BASE64_CHARS) return null;

  if (typeof b.mime_type !== "string" || !ALLOWED_MIME_TYPES.has(b.mime_type)) return null;

  if (typeof b.duration_seconds !== "number" || !Number.isFinite(b.duration_seconds)) return null;
  if (b.duration_seconds <= 0 || b.duration_seconds > MAX_DURATION_SECONDS) return null;

  let patientAge: number | undefined;
  if (b.patient_age !== undefined && b.patient_age !== null) {
    if (typeof b.patient_age !== "number" || !Number.isFinite(b.patient_age) || b.patient_age < 0 || b.patient_age > 130) {
      return null;
    }
    patientAge = b.patient_age;
  }

  let patientSex: string | undefined;
  if (b.patient_sex !== undefined && b.patient_sex !== null) {
    if (typeof b.patient_sex !== "string" || b.patient_sex.length > 20) return null;
    patientSex = b.patient_sex;
  }

  return {
    audio_base64: b.audio_base64,
    mime_type: b.mime_type,
    duration_seconds: b.duration_seconds,
    patient_age: patientAge,
    patient_sex: patientSex,
  };
}
