// Every code the transcribe-consultation Edge Function can return (read from its source,
// supabase/functions/transcribe-consultation/index.ts, not guessed), plus the client-side codes
// useDictationRecorder itself can produce before a request ever reaches that function.
export type DictationErrorCode =
  // Server (transcribe-consultation)
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CLINIC_INACTIVE"
  | "NOT_ENABLED"
  | "QUOTA_EXCEEDED"
  | "BAD_AUDIO"
  | "MODEL_ERROR"
  | "SERVER_MISCONFIGURED"
  | "METHOD_NOT_ALLOWED"
  // Client-side, never sent by the server
  | "MIC_PERMISSION_DENIED"
  | "NO_MICROPHONE"
  | "INSECURE_ORIGIN"
  | "OFFLINE"
  | "NETWORK_ERROR"
  | "UNKNOWN";

/** True for every code where a retry is a reasonable next step -- used to decide whether the
 * error UI shows a "try again" action. */
export function isRetryableDictationError(code: DictationErrorCode): boolean {
  return code !== "NOT_ENABLED" && code !== "QUOTA_EXCEEDED" && code !== "CLINIC_INACTIVE";
}

/** User-facing Hinglish message per code, per the phase spec's table. Codes the spec didn't
 * explicitly script (UNAUTHENTICATED/FORBIDDEN/SERVER_MISCONFIGURED/METHOD_NOT_ALLOWED/
 * NETWORK_ERROR/UNKNOWN) fall through to the same "AI abhi uplabdh nahi hai" upstream-error copy
 * the spec specifies for "any server/upstream error", since none of them are something the
 * doctor did wrong. NOT_ENABLED is handled -- the gate should prevent it from ever firing from
 * inside the recorder, but a stale gate cache during a live recording is a real possibility. */
export function dictationErrorMessage(code: DictationErrorCode): string {
  switch (code) {
    case "QUOTA_EXCEEDED":
      return "AI dictation ki is mahine ki limit poori ho gayi hai. Kripya Nivo Technologies se sampark karein.";
    case "CLINIC_INACTIVE":
      return "Aapka plan active nahi hai. Kripya sampark karein.";
    case "NOT_ENABLED":
      return "Ye feature aapke plan me shamil nahi hai.";
    case "BAD_AUDIO":
      return "Recording theek se nahi hui. Kripya dobara koshish karein.";
    case "MIC_PERMISSION_DENIED":
      return "Microphone ki permission nahi mili. Browser ke address bar me site settings kholkar microphone allow karein.";
    case "NO_MICROPHONE":
      return "Is device par koi microphone nahi mila.";
    case "INSECURE_ORIGIN":
      return "Microphone sirf secure (HTTPS) connection par kaam karta hai.";
    case "OFFLINE":
      return "Internet connection nahi hai.";
    case "UNAUTHENTICATED":
    case "FORBIDDEN":
    case "MODEL_ERROR":
    case "SERVER_MISCONFIGURED":
    case "METHOD_NOT_ALLOWED":
    case "NETWORK_ERROR":
    case "UNKNOWN":
    default:
      return "AI abhi uplabdh nahi hai. Thodi der baad koshish karein.";
  }
}
