const MOBILE_RE = /^\d{10}$/;

export interface SendTestMessageRequest {
  mobile: string;
  clinic_id?: string;
}

/** Returns a map of field -> message, or null if the request is valid. */
export function validateSendTestMessageRequest(body: unknown): Record<string, string> | null {
  const errors: Record<string, string> = {};

  if (!body || typeof body !== "object") {
    return { _: "Request body must be an object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.mobile !== "string" || !MOBILE_RE.test(b.mobile)) {
    errors["mobile"] = "mobile must be a 10-digit number";
  }
  if (b.clinic_id !== undefined && b.clinic_id !== null && typeof b.clinic_id !== "string") {
    errors["clinic_id"] = "clinic_id must be a string";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
