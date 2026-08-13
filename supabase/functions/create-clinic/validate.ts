const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateClinicRequest {
  clinic: {
    name: string;
    owner_name?: string;
    phone?: string;
    email?: string;
    city?: string;
    address?: string;
    logo_url?: string;
    waba_phone_number_id?: string;
    waba_business_id?: string;
    whatsapp_enabled?: boolean;
    send_time?: string;
    daily_message_cap?: number;
    monthly_message_quota?: number;
    plan_name?: string;
    plan_started_on: string;
    plan_expires_on: string;
  };
  branches: Array<{ name: string; address?: string; phone?: string }>;
  owner: {
    email: string;
    full_name: string;
    phone?: string;
  };
}

/** Returns a map of field -> message, or null if the request is valid. Never trusts client-side
 * validation -- every field is re-checked here regardless of what the UI already enforced. */
export function validateCreateClinicRequest(body: unknown): Record<string, string> | null {
  const errors: Record<string, string> = {};

  if (!body || typeof body !== "object") {
    return { _: "Request body must be an object" };
  }
  const b = body as Record<string, unknown>;
  const clinic = b.clinic as Record<string, unknown> | undefined;
  const branches = b.branches;
  const owner = b.owner as Record<string, unknown> | undefined;

  if (!clinic || typeof clinic !== "object") {
    errors["clinic"] = "Clinic details are required";
  } else {
    if (typeof clinic.name !== "string" || !clinic.name.trim()) {
      errors["clinic.name"] = "Clinic name is required";
    }

    const startedOn = typeof clinic.plan_started_on === "string" ? clinic.plan_started_on : "";
    const expiresOn = typeof clinic.plan_expires_on === "string" ? clinic.plan_expires_on : "";
    const startedMs = Date.parse(startedOn);
    const expiresMs = Date.parse(expiresOn);

    if (!startedOn || Number.isNaN(startedMs)) {
      errors["clinic.plan_started_on"] = "A valid plan start date is required";
    }
    if (!expiresOn || Number.isNaN(expiresMs)) {
      errors["clinic.plan_expires_on"] = "A valid plan expiry date is required";
    } else if (!Number.isNaN(startedMs) && expiresMs <= startedMs) {
      errors["clinic.plan_expires_on"] = "Plan expiry date must be after the start date";
    }

    if (clinic.daily_message_cap !== undefined) {
      const v = clinic.daily_message_cap;
      if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
        errors["clinic.daily_message_cap"] = "Daily message cap must be a positive integer";
      }
    }
    if (clinic.monthly_message_quota !== undefined) {
      const v = clinic.monthly_message_quota;
      if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
        errors["clinic.monthly_message_quota"] = "Monthly message quota must be a positive integer";
      }
    }
    if (clinic.email !== undefined && clinic.email !== "" && clinic.email !== null) {
      if (typeof clinic.email !== "string" || !EMAIL_RE.test(clinic.email)) {
        errors["clinic.email"] = "Clinic email is not a valid email address";
      }
    }
  }

  if (!owner || typeof owner !== "object") {
    errors["owner"] = "Owner details are required";
  } else {
    if (typeof owner.email !== "string" || !EMAIL_RE.test(owner.email)) {
      errors["owner.email"] = "A valid owner email is required";
    }
    if (typeof owner.full_name !== "string" || !owner.full_name.trim()) {
      errors["owner.full_name"] = "Owner full name is required";
    }
  }

  if (!Array.isArray(branches) || branches.length < 1) {
    errors["branches"] = "At least one branch is required";
  } else {
    branches.forEach((branch, i) => {
      const name = branch && typeof branch === "object" ? (branch as Record<string, unknown>).name : undefined;
      if (typeof name !== "string" || !name.trim()) {
        errors[`branches[${i}].name`] = "Branch name is required";
      }
    });
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
