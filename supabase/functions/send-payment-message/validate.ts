const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SendPaymentMessageRequest {
  patient_id: string;
  client_request_id: string;
}

/** Returns a map of field -> message, or null if the request is valid. */
export function validateSendPaymentMessageRequest(body: unknown): Record<string, string> | null {
  const errors: Record<string, string> = {};

  if (!body || typeof body !== "object") {
    return { _: "Request body must be an object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.patient_id !== "string" || !UUID_RE.test(b.patient_id)) {
    errors["patient_id"] = "patient_id must be a valid UUID";
  }
  if (typeof b.client_request_id !== "string" || !UUID_RE.test(b.client_request_id)) {
    errors["client_request_id"] = "client_request_id must be a valid UUID";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
