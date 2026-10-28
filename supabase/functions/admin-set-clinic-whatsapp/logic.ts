import { GRAPH_API_VERSION } from "../_shared/whatsapp-graph-api.ts";

// Pure helpers for admin-set-clinic-whatsapp (kept out of index.ts so they can be unit-tested
// without starting Deno.serve).

/** Same shape the browser-side Embedded Signup code accepts for a Meta id: digits only. */
const NUMERIC_ID = /^\d{5,32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RequestMode = "verify_only" | "detach" | "attach";

export type ParsedRequest =
  | { ok: true; mode: "verify_only"; phoneNumberId: string }
  | { ok: true; mode: "detach"; clinicId: string }
  | {
    ok: true;
    mode: "attach";
    clinicId: string;
    phoneNumberId: string;
    businessId: string | null;
    enable: boolean;
  }
  | { ok: false; fields: Record<string, string> };

/** "" and whitespace are treated exactly like a missing value (NULL), never stored as "". */
function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Validates the body. Nothing about WHO is calling is read from it -- identity and role come only
 * from the verified JWT (authorizeSuperAdmin). `clinic_id` here is the clinic being edited. */
export function parseRequest(body: unknown): ParsedRequest {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};

  if (b.verify_only !== undefined && typeof b.verify_only !== "boolean") fields.verify_only = "verify_only must be a boolean";
  if (b.detach !== undefined && typeof b.detach !== "boolean") fields.detach = "detach must be a boolean";
  if (b.enable !== undefined && typeof b.enable !== "boolean") fields.enable = "enable must be a boolean";
  if (b.verify_only === true && b.detach === true) fields.detach = "verify_only and detach cannot be used together";
  if (Object.keys(fields).length > 0) return { ok: false, fields };

  const phoneNumberId = cleanString(b.waba_phone_number_id);
  const businessId = cleanString(b.waba_business_id);
  const clinicId = cleanString(b.clinic_id);

  if (clinicId !== null && !UUID.test(clinicId)) fields.clinic_id = "clinic_id must be a valid id";

  if (b.verify_only === true) {
    if (phoneNumberId === null) fields.waba_phone_number_id = "waba_phone_number_id is required";
    else if (!NUMERIC_ID.test(phoneNumberId)) fields.waba_phone_number_id = "waba_phone_number_id must be digits only";
    if (Object.keys(fields).length > 0) return { ok: false, fields };
    return { ok: true, mode: "verify_only", phoneNumberId: phoneNumberId as string };
  }

  if (clinicId === null) fields.clinic_id = "clinic_id is required";

  if (b.detach === true) {
    if (Object.keys(fields).length > 0) return { ok: false, fields };
    return { ok: true, mode: "detach", clinicId: clinicId as string };
  }

  if (phoneNumberId === null) fields.waba_phone_number_id = "waba_phone_number_id is required";
  else if (!NUMERIC_ID.test(phoneNumberId)) fields.waba_phone_number_id = "waba_phone_number_id must be digits only";
  if (businessId !== null && !NUMERIC_ID.test(businessId)) fields.waba_business_id = "waba_business_id must be digits only";
  if (typeof b.enable !== "boolean") fields.enable = "enable is required (true or false)";
  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    mode: "attach",
    clinicId: clinicId as string,
    phoneNumberId: phoneNumberId as string,
    businessId,
    enable: b.enable as boolean,
  };
}

export interface MetaPhoneInfo {
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  code_verification_status: string | null;
}

export type MetaCheck =
  | { ok: true; info: MetaPhoneInfo }
  | { ok: false; status: number; error: string; metaErrorCode: number | null };

const asStringOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Asks Meta whether this phone_number_id exists and is reachable with the platform token.
 * The token is only ever sent as a request header: it is never logged, never put in a URL and never
 * returned. */
export async function checkPhoneNumberWithMeta(
  phoneNumberId: string,
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<MetaCheck> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}` +
    `?fields=display_phone_number,verified_name,quality_rating,code_verification_status`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, status: 502, error: "Could not reach Meta to check this number. Please try again.", metaErrorCode: null };
  }

  const result = await response.json().catch(() => null) as Record<string, unknown> | null;

  if (response.ok && result && typeof result === "object" && !result.error) {
    // Meta echoes the id back; if it is not the one we asked about, do not trust the answer.
    if (String(result.id ?? "") !== phoneNumberId) {
      return { ok: false, status: 502, error: "Meta returned an unexpected answer for this number.", metaErrorCode: null };
    }
    return {
      ok: true,
      info: {
        display_phone_number: asStringOrNull(result.display_phone_number),
        verified_name: asStringOrNull(result.verified_name),
        quality_rating: asStringOrNull(result.quality_rating),
        code_verification_status: asStringOrNull(result.code_verification_status),
      },
    };
  }

  const metaError = (result?.error ?? {}) as Record<string, unknown>;
  const code = typeof metaError.code === "number" ? metaError.code : null;

  // 190 = OUR platform token is bad. That is a server problem, not a wrong number.
  if (code === 190) {
    return { ok: false, status: 502, error: "The platform's Meta access token is not working. Please contact the developer.", metaErrorCode: code };
  }
  // 100 / 33 = the id does not exist, or this token has no access to it. 4xx without a code is treated the same.
  if (code === 100 || code === 33 || (code === null && response.status >= 400 && response.status < 500)) {
    return {
      ok: false,
      status: 422,
      error: "Meta could not find this phone_number_id, or our Meta access does not cover it. Nothing was saved.",
      metaErrorCode: code,
    };
  }
  return { ok: false, status: 502, error: "Meta could not verify this number right now. Nothing was saved.", metaErrorCode: code };
}
