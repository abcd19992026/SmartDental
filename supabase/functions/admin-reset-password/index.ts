import { authorizeOwnerOrSuperAdmin } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { generateTempPassword } from "../_shared/password.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const auth = await authorizeOwnerOrSuperAdmin(req);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  let body: { user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body.user_id !== "string" || !body.user_id) {
    return json({ error: "Validation failed", fields: { user_id: "user_id is required" } }, 400);
  }
  const targetUserId = body.user_id;

  const { serviceClient } = auth;

  const { data: targetProfile, error: targetError } = await serviceClient
    .from("profiles")
    .select("id, role, clinic_id")
    .eq("id", targetUserId)
    .single();

  if (targetError || !targetProfile) {
    return json({ error: "User not found" }, 404);
  }
  // Neither a super admin nor an owner may reset another super admin's password through this
  // route -- only clinic users (owner/receptionist) are in scope, identified by having a
  // clinic_id.
  if (targetProfile.role === "super_admin" || !targetProfile.clinic_id) {
    return json({ error: "Cannot reset a platform administrator's password through this route" }, 403);
  }
  // Containment: an owner may only act on users in their own clinic. A super_admin is unrestricted
  // (existing behaviour, unchanged).
  if (auth.role === "owner" && targetProfile.clinic_id !== auth.clinicId) {
    return json({ error: "Forbidden: you can only manage users in your own clinic" }, 403);
  }

  const tempPassword = generateTempPassword();
  const { error: updateError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
    password: tempPassword,
  });
  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  await serviceClient.from("activity_log").insert({
    clinic_id: targetProfile.clinic_id,
    user_id: auth.userId,
    action: "password_reset",
    entity_type: "profile",
    entity_id: targetUserId,
    meta: {},
  });

  return json({ user_id: targetUserId, temporary_password: tempPassword }, 200);
});
