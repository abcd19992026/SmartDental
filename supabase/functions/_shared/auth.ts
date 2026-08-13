import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface VerifiedCaller {
  ok: true;
  userId: string;
  serviceClient: SupabaseClient;
}

interface VerifyErr {
  ok: false;
  status: number;
  error: string;
}

/**
 * Steps 1-2 shared by every authorization gate in this project:
 * 1. Read the JWT from the Authorization header -- 401 if absent.
 * 2. Verify it with an anon-key client's auth.getUser() -- 401 if invalid.
 *
 * Returns a service-role client for the caller's own subsequent profile lookup (step 3, which
 * differs per gate -- see authorizeSuperAdmin / authorizeOwnerOrSuperAdmin below). The caller's
 * identity comes ONLY from this verified JWT; nothing from the request body is ever trusted for
 * who is making the call.
 */
async function verifyBearerToken(req: Request): Promise<VerifiedCaller | VerifyErr> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const anonClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { ok: true, userId: userData.user.id, serviceClient };
}

export interface SuperAdminAuthOk {
  ok: true;
  userId: string;
  serviceClient: SupabaseClient;
}

export interface SuperAdminAuthErr {
  ok: false;
  status: number;
  error: string;
}

export type SuperAdminAuth = SuperAdminAuthOk | SuperAdminAuthErr;

/**
 * Step 3 for super-admin-only routes: look up the caller's profile with a service-role client
 * and confirm role = 'super_admin' and is_active = true -- 403 otherwise.
 */
export async function authorizeSuperAdmin(req: Request): Promise<SuperAdminAuth> {
  const verified = await verifyBearerToken(req);
  if (!verified.ok) return verified;
  const { userId, serviceClient } = verified;

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .single();

  if (profileError || !profile || profile.role !== "super_admin" || !profile.is_active) {
    return { ok: false, status: 403, error: "Forbidden: super admin access required" };
  }

  return { ok: true, userId, serviceClient };
}

export interface OwnerOrSuperAdminAuthOk {
  ok: true;
  userId: string;
  role: "owner" | "super_admin";
  /** The caller's own clinic_id. Always present for an owner, always null for a super_admin
   * (see chk_super_admin_no_clinic). Callers must resolve the ACTING clinic from this field for
   * an owner -- never from anything in the request body. */
  clinicId: string | null;
  serviceClient: SupabaseClient;
}

export type OwnerOrSuperAdminAuth = OwnerOrSuperAdminAuthOk | SuperAdminAuthErr;

/**
 * Step 3 for routes an owner may also use (staff provisioning, resetting/activating their own
 * clinic's staff): confirm the caller's profile is_active = true and role IN ('owner',
 * 'super_admin') -- 403 otherwise. Containment on top of this (an owner acting only within their
 * own clinic, never escalating to super_admin) is each route's own responsibility, using the
 * `role` / `clinicId` returned here.
 */
export async function authorizeOwnerOrSuperAdmin(req: Request): Promise<OwnerOrSuperAdminAuth> {
  const verified = await verifyBearerToken(req);
  if (!verified.ok) return verified;
  const { userId, serviceClient } = verified;

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role, is_active, clinic_id")
    .eq("id", userId)
    .single();

  if (
    profileError ||
    !profile ||
    !profile.is_active ||
    (profile.role !== "owner" && profile.role !== "super_admin")
  ) {
    return { ok: false, status: 403, error: "Forbidden: owner or super admin access required" };
  }

  return {
    ok: true,
    userId,
    role: profile.role as "owner" | "super_admin",
    clinicId: profile.clinic_id,
    serviceClient,
  };
}
