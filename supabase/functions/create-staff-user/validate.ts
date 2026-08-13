const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = ["owner", "receptionist"];

export interface CreateStaffUserRequest {
  email: string;
  full_name: string;
  phone?: string;
  role: string;
  branch_id?: string;
  clinic_id?: string;
}

/** Returns a map of field -> message, or null if the request is valid. Never trusts client-side
 * validation -- every field is re-checked here regardless of what the UI already enforced.
 *
 * The role-ceiling check (rejecting an attempted 'super_admin') is deliberately NOT here -- it's
 * an authorization-level rejection (403), handled in index.ts before this validation runs, so it
 * isn't conflated with an ordinary field-validation 400. */
export function validateCreateStaffUserRequest(body: unknown): Record<string, string> | null {
  const errors: Record<string, string> = {};

  if (!body || typeof body !== "object") {
    return { _: "Request body must be an object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.email !== "string" || !EMAIL_RE.test(b.email)) {
    errors["email"] = "A valid email is required";
  }
  if (typeof b.full_name !== "string" || !b.full_name.trim()) {
    errors["full_name"] = "Full name is required";
  }
  if (typeof b.role !== "string" || !ALLOWED_ROLES.includes(b.role)) {
    errors["role"] = "Role must be one of: owner, receptionist";
  }
  if (b.role === "receptionist" && (typeof b.branch_id !== "string" || !b.branch_id)) {
    errors["branch_id"] = "A branch is required for a receptionist";
  }
  if (b.clinic_id !== undefined && b.clinic_id !== null && typeof b.clinic_id !== "string") {
    errors["clinic_id"] = "clinic_id must be a string";
  }
  if (b.phone !== undefined && b.phone !== null && typeof b.phone !== "string") {
    errors["phone"] = "phone must be a string";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
