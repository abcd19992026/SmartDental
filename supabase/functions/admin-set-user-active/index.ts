import { authorizeOwnerOrSuperAdmin } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";

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

  let body: { user_id?: unknown; is_active?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const fieldErrors: Record<string, string> = {};
  if (typeof body.user_id !== "string" || !body.user_id) {
    fieldErrors["user_id"] = "user_id is required";
  }
  if (typeof body.is_active !== "boolean") {
    fieldErrors["is_active"] = "is_active must be a boolean";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return json({ error: "Validation failed", fields: fieldErrors }, 400);
  }
  const targetUserId = body.user_id as string;
  const nextActive = body.is_active as boolean;

  const { serviceClient } = auth;

  const { data: targetProfile, error: targetError } = await serviceClient
    .from("profiles")
    .select("id, role, clinic_id")
    .eq("id", targetUserId)
    .single();

  if (targetError || !targetProfile) {
    return json({ error: "User not found" }, 404);
  }
  if (targetProfile.role === "super_admin" || !targetProfile.clinic_id) {
    return json({ error: "Cannot change a platform administrator's status through this route" }, 403);
  }
  // Containment: an owner may only act on users in their own clinic. A super_admin is unrestricted
  // (existing behaviour, unchanged).
  if (auth.role === "owner" && targetProfile.clinic_id !== auth.clinicId) {
    return json({ error: "Forbidden: you can only manage users in your own clinic" }, 403);
  }

  const { error: updateError } = await serviceClient
    .from("profiles")
    .update({ is_active: nextActive })
    .eq("id", targetUserId);
  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  await serviceClient.from("activity_log").insert({
    clinic_id: targetProfile.clinic_id,
    user_id: auth.userId,
    action: nextActive ? "user_activated" : "user_deactivated",
    entity_type: "profile",
    entity_id: targetUserId,
    meta: {},
  });

  return json({ user_id: targetUserId, is_active: nextActive }, 200);
});
