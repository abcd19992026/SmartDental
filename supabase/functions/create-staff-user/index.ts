import { authorizeOwnerOrSuperAdmin } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { generateTempPassword } from "../_shared/password.ts";
import { retryWithBackoff } from "../_shared/retry.ts";
import { validateCreateStaffUserRequest, type CreateStaffUserRequest } from "./validate.ts";

function errMessage(err: unknown): string | null {
  if (!err) return null;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Steps 1-3: verified JWT, active profile, role IN ('owner', 'super_admin').
  const auth = await authorizeOwnerOrSuperAdmin(req);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Step 5 (role ceiling), checked before general field validation so it surfaces as the
  // authorization-level 403 it actually is, not a generic 400. Applies "regardless of caller" --
  // a super_admin cannot create another super_admin through this route either.
  const rawRole = body && typeof body === "object" ? (body as Record<string, unknown>).role : undefined;
  if (rawRole === "super_admin") {
    return json({ error: "Cannot create a platform administrator through this route" }, 403);
  }

  const validationErrors = validateCreateStaffUserRequest(body);
  if (validationErrors) {
    return json({ error: "Validation failed", fields: validationErrors }, 400);
  }
  const input = body as CreateStaffUserRequest;
  const { serviceClient } = auth;
  const role = input.role as "owner" | "receptionist";

  // Step 4 (containment): an owner's clinic_id comes ONLY from their own verified profile, never
  // from the body -- this is what stops clinic_id in the body from ever placing a new user in
  // someone else's clinic. A super_admin may supply one, but it's validated against a real clinic.
  let clinicId: string;
  if (auth.role === "owner") {
    // chk_super_admin_no_clinic guarantees an owner's profile always has a clinic_id.
    clinicId = auth.clinicId as string;
  } else {
    if (typeof input.clinic_id !== "string" || !input.clinic_id) {
      return json(
        { error: "Validation failed", fields: { clinic_id: "clinic_id is required" } },
        400,
      );
    }
    const { data: clinicRow, error: clinicError } = await serviceClient
      .from("clinics")
      .select("id")
      .eq("id", input.clinic_id)
      .maybeSingle();
    if (clinicError || !clinicRow) {
      return json(
        { error: "Validation failed", fields: { clinic_id: "clinic_id does not refer to an existing clinic" } },
        400,
      );
    }
    clinicId = clinicRow.id;
  }

  // branch_id is only meaningful for a receptionist, and is always re-validated against the
  // resolved clinic -- never trusted as belonging there just because the caller supplied it.
  let branchId: string | null = null;
  if (role === "receptionist") {
    const { data: branchRow, error: branchError } = await serviceClient
      .from("branches")
      .select("id, clinic_id")
      .eq("id", input.branch_id as string)
      .maybeSingle();
    if (branchError || !branchRow) {
      return json(
        { error: "Validation failed", fields: { branch_id: "branch_id does not refer to an existing branch" } },
        400,
      );
    }
    if (branchRow.clinic_id !== clinicId) {
      return json(
        { error: "Validation failed", fields: { branch_id: "branch_id does not belong to the resolved clinic" } },
        400,
      );
    }
    branchId = branchRow.id;
  }

  let authUserId: string | null = null;

  try {
    const tempPassword = generateTempPassword();

    const { data: userData, error: userError } = await serviceClient.auth.admin.createUser({
      email: input.email,
      password: tempPassword,
      email_confirm: true,
    });
    if (userError || !userData.user) {
      throw new Error(userError?.message ?? "Failed to create the staff user account");
    }
    authUserId = userData.user.id;

    const { error: profileError } = await serviceClient.from("profiles").insert({
      id: authUserId,
      clinic_id: clinicId,
      branch_id: branchId,
      role,
      full_name: input.full_name,
      phone: input.phone ?? null,
      is_active: true,
    });
    if (profileError) throw new Error(profileError.message);

    // Never persist the temporary password in plaintext anywhere -- not here, only in this
    // one-time response body.
    await serviceClient.from("activity_log").insert({
      clinic_id: clinicId,
      user_id: auth.userId,
      action: "staff_user_created",
      entity_type: "profile",
      entity_id: authUserId,
      meta: { created_user_id: authUserId, role },
    });

    return json(
      {
        user_id: authUserId,
        email: input.email,
        role,
        branch_id: branchId,
        temporary_password: tempPassword,
      },
      200,
    );
  } catch (err) {
    // Same retry-with-backoff + ORPHAN_CLEANUP_REQUIRED compensation pattern as create-clinic --
    // deliberately not a second approach. Only the auth user can be orphaned here (the profile
    // insert is the last write), so there's a single compensation step, not two.
    let authDeleteError: string | null = null;
    if (authUserId) {
      const authResult = await retryWithBackoff(() => serviceClient.auth.admin.deleteUser(authUserId!));
      if (authResult.error) {
        authDeleteError = errMessage(authResult.error);
        console.error("Compensation: failed to delete auth user after retries", authUserId, authResult.error);
      }
    }

    if (authDeleteError) {
      const { error: logError } = await serviceClient.from("activity_log").insert({
        clinic_id: clinicId,
        user_id: auth.userId,
        action: "ORPHAN_CLEANUP_REQUIRED",
        entity_type: "profile",
        entity_id: authUserId,
        meta: {
          auth_user_id: authUserId,
          auth_delete_error: authDeleteError,
          original_error: errMessage(err),
        },
      });
      if (logError) {
        console.error("Failed to write ORPHAN_CLEANUP_REQUIRED activity_log row", authUserId, logError);
      }
    }

    return json(
      {
        error: errMessage(err) ?? "Failed to create staff user",
        compensation: { auth_user_deleted: authUserId === null || !authDeleteError },
      },
      500,
    );
  }
});
