import { authorizeSuperAdmin } from "../_shared/auth.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { generateTempPassword } from "../_shared/password.ts";
import { retryWithBackoff } from "../_shared/retry.ts";
import { validateCreateClinicRequest, type CreateClinicRequest } from "./validate.ts";

function errMessage(err: unknown): string | null {
  if (!err) return null;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

Deno.serve(async (req) => {
  // Per-request origin echo (allow-listed to the production frontend + local Vite dev server),
  // not the shared static corsHeaders -- this is a browser-invoked, super-admin-triggered action
  // that genuinely needs to work from localhost during development.
  const cors = corsHeadersForRequest(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  const auth = await authorizeSuperAdmin(req);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status, cors);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }

  const validationErrors = validateCreateClinicRequest(body);
  if (validationErrors) {
    return json({ error: "Validation failed", fields: validationErrors }, 400, cors);
  }
  // Narrowed by validateCreateClinicRequest above -- role/clinic_id/user_id are never read from
  // this body anywhere below; the owner's identity comes only from auth.admin.createUser()'s
  // own response, and the acting super admin's identity comes only from `auth.userId` (the
  // verified JWT), never from the request.
  const input = body as CreateClinicRequest;
  const { serviceClient } = auth;

  // Step 1: clinic + branches, atomically, via the RPC (see
  // supabase/migrations/*_rpc_create_clinic_with_branches.sql).
  const { data: rpcData, error: rpcError } = await serviceClient.rpc("create_clinic_with_branches", {
    p_clinic: {
      name: input.clinic.name,
      owner_name: input.clinic.owner_name ?? null,
      phone: input.clinic.phone ?? null,
      email: input.clinic.email ?? null,
      city: input.clinic.city ?? null,
      address: input.clinic.address ?? null,
      logo_url: input.clinic.logo_url ?? null,
      waba_phone_number_id: input.clinic.waba_phone_number_id ?? null,
      waba_business_id: input.clinic.waba_business_id ?? null,
      whatsapp_enabled: input.clinic.whatsapp_enabled ?? false,
      send_time: input.clinic.send_time ?? "10:00",
      daily_message_cap: input.clinic.daily_message_cap ?? 150,
      monthly_message_quota: input.clinic.monthly_message_quota ?? 3000,
      plan_name: input.clinic.plan_name ?? "standard",
      plan_started_on: input.clinic.plan_started_on,
      plan_expires_on: input.clinic.plan_expires_on,
    },
    p_branches: input.branches,
  });

  if (rpcError || !rpcData) {
    return json({ error: rpcError?.message ?? "Failed to create clinic" }, 500, cors);
  }

  const clinicId = (rpcData as { clinic_id: string; branch_ids: string[] }).clinic_id;
  const branchIds = (rpcData as { clinic_id: string; branch_ids: string[] }).branch_ids;

  // auth.admin.createUser() is not part of the Postgres transaction above, so from here on
  // every failure is compensated explicitly rather than relying on a rollback that can't reach
  // across the auth/database boundary.
  let authUserId: string | null = null;

  try {
    const tempPassword = generateTempPassword();

    const { data: userData, error: userError } = await serviceClient.auth.admin.createUser({
      email: input.owner.email,
      password: tempPassword,
      email_confirm: true,
    });
    if (userError || !userData.user) {
      throw new Error(userError?.message ?? "Failed to create the owner account");
    }
    authUserId = userData.user.id;

    // role is hardcoded to 'owner' here -- never taken from the request body, so an injected
    // `role: "super_admin"` field anywhere in the payload has no effect.
    const { error: profileError } = await serviceClient.from("profiles").insert({
      id: authUserId,
      clinic_id: clinicId,
      branch_id: null,
      role: "owner",
      full_name: input.owner.full_name,
      phone: input.owner.phone ?? null,
      is_active: true,
    });
    if (profileError) throw new Error(profileError.message);

    const { error: seedError } = await serviceClient.rpc("seed_default_treatment_types", {
      p_clinic_id: clinicId,
    });
    if (seedError) throw new Error(seedError.message);

    const { error: seedMedicinesError } = await serviceClient.rpc("seed_default_medicines", {
      p_clinic_id: clinicId,
    });
    if (seedMedicinesError) throw new Error(seedMedicinesError.message);

    const { error: completeError } = await serviceClient
      .from("clinics")
      .update({ onboarding_completed: true })
      .eq("id", clinicId);
    if (completeError) throw new Error(completeError.message);

    // Never persist the temporary password in plaintext anywhere -- not here, not in the
    // response schema's stored fields, only in this one-time response body.
    await serviceClient.from("activity_log").insert({
      clinic_id: clinicId,
      user_id: auth.userId,
      action: "clinic_created",
      entity_type: "clinic",
      entity_id: clinicId,
      meta: { owner_email: input.owner.email, branch_count: branchIds.length },
    });

    return json(
      {
        clinic_id: clinicId,
        branch_ids: branchIds,
        owner: { id: authUserId, email: input.owner.email, temporary_password: tempPassword },
      },
      200,
      cors,
    );
  } catch (err) {
    // Compensation: retry each step up to 3x with exponential backoff before giving up on it.
    // A single unretried failure here is exactly how a clinic or an auth user gets orphaned.
    let authDeleteError: string | null = null;
    if (authUserId) {
      const authResult = await retryWithBackoff(() => serviceClient.auth.admin.deleteUser(authUserId!));
      if (authResult.error) {
        authDeleteError = errMessage(authResult.error);
        console.error("Compensation: failed to delete auth user after retries", authUserId, authResult.error);
      }
    }

    const cascadeResult = await retryWithBackoff(() =>
      serviceClient.rpc("delete_clinic_cascade", { p_clinic_id: clinicId }),
    );
    const cascadeDeleteError = cascadeResult.error ? errMessage(cascadeResult.error) : null;
    if (cascadeResult.error) {
      console.error("Compensation: failed to delete clinic after retries", clinicId, cascadeResult.error);
    }

    // If either compensation step never succeeded, this must never just disappear into a
    // generic 500 -- leave a durable, on-demand-findable trail (see also the
    // find_orphaned_clinics() RPC, which independently detects this same state by scanning for
    // it directly, in case even this log write fails).
    if (authDeleteError || cascadeDeleteError) {
      const { error: logError } = await serviceClient.from("activity_log").insert({
        clinic_id: clinicId,
        user_id: auth.userId,
        action: "ORPHAN_CLEANUP_REQUIRED",
        entity_type: "clinic",
        entity_id: clinicId,
        meta: {
          auth_user_id: authUserId,
          auth_delete_error: authDeleteError,
          cascade_delete_error: cascadeDeleteError,
          original_error: errMessage(err),
        },
      });
      if (logError) {
        console.error("Failed to write ORPHAN_CLEANUP_REQUIRED activity_log row", clinicId, logError);
      }
    }

    return json(
      {
        error: errMessage(err) ?? "Failed to create clinic",
        compensation: {
          auth_user_deleted: authUserId === null || !authDeleteError,
          clinic_deleted: !cascadeDeleteError,
        },
      },
      500,
      cors,
    );
  }
});
