const ID_RE = /^\d{5,32}$/;
const KNOWN_EVENTS = [
  "FINISH",
  "FINISH_ONLY_WABA",
  "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  "FINISH_OBO_MIGRATION",
  "FINISH_GRANT_ONLY_API_ACCESS",
];

export interface ConnectWhatsAppRequest {
  code: string;
  waba_id: string;
  phone_number_id: string;
  business_id?: string;
  /** What the browser says it launched. A hint only -- the server decides coexistence itself from
   * Meta's is_on_biz_app, never from this. */
  mode?: string;
  /** Embedded Signup finish event reported by the browser. A hint only, same as `mode`. */
  event?: string;
}

/** Everything in here comes from the browser and is untrusted: this only checks the SHAPE. Whether
 * the clinic really owns this WABA / number is verified against Meta in index.ts. */
export function validateConnectWhatsAppRequest(body: unknown): Record<string, string> | null {
  const errors: Record<string, string> = {};

  if (!body || typeof body !== "object") {
    return { _: "Request body must be an object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.code !== "string" || b.code.length < 10 || b.code.length > 2048) {
    errors["code"] = "code is required";
  }
  if (typeof b.waba_id !== "string" || !ID_RE.test(b.waba_id)) {
    errors["waba_id"] = "waba_id must be a numeric id";
  }
  if (typeof b.phone_number_id !== "string" || !ID_RE.test(b.phone_number_id)) {
    errors["phone_number_id"] = "phone_number_id must be a numeric id";
  }
  if (b.business_id !== undefined && b.business_id !== null && (typeof b.business_id !== "string" || !ID_RE.test(b.business_id))) {
    errors["business_id"] = "business_id must be a numeric id";
  }
  if (b.mode !== undefined && b.mode !== null && (typeof b.mode !== "string" || b.mode.length > 32)) {
    errors["mode"] = "mode must be a short string";
  }
  if (b.event !== undefined && b.event !== null && (typeof b.event !== "string" || !KNOWN_EVENTS.includes(b.event))) {
    errors["event"] = "event is not a known Embedded Signup finish event";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
