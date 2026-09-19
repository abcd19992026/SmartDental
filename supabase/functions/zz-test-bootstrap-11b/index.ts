// TEMPORARY, throwaway -- fixture bootstrap for Phase 11B-1 verification. Deleted/neutered after use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BOOTSTRAP_SECRET = "zz11b-bootstrap-3a7f9d2e6c1b8450";

Deno.serve(async (req) => {
  if (req.headers.get("x-bootstrap-secret") !== BOOTSTRAP_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === "create_clinic") {
      const { data: clinic, error: clinicError } = await serviceClient
        .from("clinics")
        .insert({
          name: body.name,
          is_active: true,
          plan_expires_on: "2099-01-01",
          ai_dictation_enabled: !!body.ai_dictation_enabled,
          ai_dictation_monthly_cap_seconds: body.ai_dictation_monthly_cap_seconds ?? 18000,
        })
        .select("id")
        .single();
      if (clinicError || !clinic) throw new Error(clinicError?.message ?? "clinic insert failed");

      const { data: userData, error: userError } = await serviceClient.auth.admin.createUser({
        email: body.owner_email,
        password: body.owner_password,
        email_confirm: true,
      });
      if (userError || !userData.user) throw new Error(userError?.message ?? "user create failed");

      const { error: profileError } = await serviceClient.from("profiles").insert({
        id: userData.user.id,
        clinic_id: clinic.id,
        role: "owner",
        full_name: "ZZ Test Owner",
        is_active: true,
      });
      if (profileError) throw new Error(profileError.message);

      return new Response(JSON.stringify({ clinic_id: clinic.id, owner_user_id: userData.user.id }), { status: 200 });
    }

    if (body.action === "set_cap") {
      const { error } = await serviceClient.from("clinics").update({ ai_dictation_monthly_cap_seconds: body.cap }).eq("id", body.clinic_id);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500 });
  }
});
