import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
 * Mandatory, in this order:
 * 1. Read the JWT from the Authorization header -- 401 if absent.
 * 2. Verify it with an anon-key client's auth.getUser() -- 401 if invalid.
 * 3. Look up the caller's profile with a service-role client and confirm
 *    role = 'super_admin' and is_active = true -- 403 otherwise.
 *
 * The caller's identity comes ONLY from the verified JWT. Nothing from the request body is
 * ever trusted for who is making the call.
 */
export async function authorizeSuperAdmin(req: Request): Promise<SuperAdminAuth> {
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

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role, is_active")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== "super_admin" || !profile.is_active) {
    return { ok: false, status: 403, error: "Forbidden: super admin access required" };
  }

  return { ok: true, userId: userData.user.id, serviceClient };
}
