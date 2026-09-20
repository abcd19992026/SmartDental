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

/** User-facing English message per code. Codes not explicitly scripted fall through to the
 * generic upstream error copy ("AI isn't available right now. Please try again in a moment."),
 * since none of them are something the doctor did wrong. */
export function dictationErrorMessage(code: DictationErrorCode): string {
  switch (code) {
    case "QUOTA_EXCEEDED":
      return "This month's AI dictation limit has been reached. Please contact Nivo Technologies.";
    case "CLINIC_INACTIVE":
      return "Your plan isn't active. Please contact support.";
    case "NOT_ENABLED":
      return "This feature isn't included in your plan.";
    case "BAD_AUDIO":
      return "The recording didn't come through properly. Please try again.";
    case "MIC_PERMISSION_DENIED":
      return "Microphone permission was denied. Please allow microphone access in your browser settings.";
    case "NO_MICROPHONE":
      return "No microphone was found on this device.";
    case "INSECURE_ORIGIN":
      return "Microphone requires a secure (HTTPS) connection.";
    case "OFFLINE":
      return "No internet connection.";
    case "UNAUTHENTICATED":
    case "FORBIDDEN":
    case "MODEL_ERROR":
    case "SERVER_MISCONFIGURED":
    case "METHOD_NOT_ALLOWED":
    case "NETWORK_ERROR":
    case "UNKNOWN":
    default:
      return "AI isn't available right now. Please try again in a moment.";
  }
}

