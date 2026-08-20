const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SendRecallNowRequest {
  recall_id: string;
}

/** Returns a map of field -> message, or null if the request is valid. */
export function validateSendRecallNowRequest(body: unknown): Record<string, string> | null {
  const errors: Record<string, string> = {};

  if (!body || typeof body !== "object") {
    return { _: "Request body must be an object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.recall_id !== "string" || !UUID_RE.test(b.recall_id)) {
    errors["recall_id"] = "recall_id must be a valid UUID";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
