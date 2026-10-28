import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { authorizeSuperAdmin } from "../_shared/auth.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { checkPhoneNumberWithMeta, parseRequest } from "./logic.ts";

// Super-admin only. Attaches (or detaches) a WhatsApp number that the platform owner added to the
// platform's own WABA by hand in Meta WhatsApp Manager -- used until clinics can self-connect with
// Embedded Signup. Such a clinic has NO clinic_whatsapp_connections row, so it sends with the shared
// META_ACCESS_TOKEN (see resolveWhatsappCredentials).
//
// The clinics row is written with the CALLER'S OWN JWT, not the service role, on purpose: RLS
// (clinics_super_admin_update) and protect_clinic_billing_fields() then both apply, and the
// log_activity trigger records the real admin as user_id. That trigger is the audit trail for attach
// and detach ('clinic_updated' with old/new values), so no second activity_log row is written here.

Deno.serve(async (req) => {
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
  const { serviceClient } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }
  const parsed = parseRequest(body);
  if (!parsed.ok) {
    return json({ error: "Validation failed", fields: parsed.fields }, 400, cors);
  }

  // Writes below go through the caller's own JWT (verified above by authorizeSuperAdmin).
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- Verify with Meta (verify_only and attach). Nothing is saved if this fails. ----------------
  let metaInfo = null;
  if (parsed.mode === "verify_only" || parsed.mode === "attach") {
    const metaToken = Deno.env.get("META_ACCESS_TOKEN");
    if (!metaToken) {
      console.error("META_ACCESS_TOKEN is not configured");
      return json({ error: "Server misconfigured" }, 500, cors);
    }
    const check = await checkPhoneNumberWithMeta(parsed.phoneNumberId, metaToken);
    if (!check.ok) {
      return json({ error: check.error, meta_error_code: check.metaErrorCode }, check.status, cors);
    }
    metaInfo = check.info;

    if (parsed.mode === "verify_only") {
      return json({ verified: true, saved: false, ...metaInfo }, 200, cors);
    }
  }

  // ---- attach / detach need an existing clinic ---------------------------------------------------
  const { data: clinic, error: clinicError } = await serviceClient
    .from("clinics")
    .select("id, name, waba_phone_number_id, waba_business_id, whatsapp_enabled")
    .eq("id", parsed.clinicId)
    .maybeSingle();
  if (clinicError) {
    console.error(`admin-set-clinic-whatsapp: clinic lookup failed (${clinicError.code})`);
    return json({ error: "Could not load the clinic" }, 500, cors);
  }
  if (!clinic) {
    return json({ error: "Validation failed", fields: { clinic_id: "clinic_id does not refer to an existing clinic" } }, 400, cors);
  }

  // A clinic that connected itself with Embedded Signup has a connection row, and sending then uses
  // THAT row's token and number and ignores clinics.waba_phone_number_id. Editing the clinics row
  // under it would silently do nothing (or worse, show a number that is not the one in use), so it
  // is refused here: disconnect it through the normal Disconnect flow first.
  const { data: connection, error: connectionError } = await serviceClient
    .from("clinic_whatsapp_connections")
    .select("status")
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (connectionError) {
    console.error(`admin-set-clinic-whatsapp: connection lookup failed (${connectionError.code})`);
    return json({ error: "Could not check the clinic's WhatsApp connection" }, 500, cors);
  }
  if (connection) {
    return json(
      {
        error:
          `This clinic has a self-connected WhatsApp record (status: ${connection.status}). ` +
          `Sending uses that record, not this number. Disconnect it first, then attach manually.`,
        error_code: "SELF_CONNECTION_EXISTS",
      },
      409,
      cors,
    );
  }

  // ---- detach ------------------------------------------------------------------------------------
  if (parsed.mode === "detach") {
    if (clinic.waba_phone_number_id === null && clinic.waba_business_id === null && clinic.whatsapp_enabled === false) {
      return json({ clinic_id: clinic.id, detached: true, changed: false }, 200, cors);
    }
    const { data: updated, error: updateError } = await userClient
      .from("clinics")
      .update({ waba_phone_number_id: null, waba_business_id: null, whatsapp_enabled: false })
      .eq("id", clinic.id)
      .select("id");
    if (updateError) {
      console.error(`admin-set-clinic-whatsapp: detach failed (${updateError.code})`);
      return json({ error: "Could not detach the number" }, 500, cors);
    }
    // RLS shows "nothing happened" as 0 rows, not as an error -- so the row count is checked.
    if (!updated || updated.length !== 1) {
      return json({ error: "Detach changed 0 rows; nothing was saved" }, 500, cors);
    }
    return json(
      { clinic_id: clinic.id, detached: true, changed: true, previous_waba_phone_number_id: clinic.waba_phone_number_id },
      200,
      cors,
    );
  }

  // ---- attach ------------------------------------------------------------------------------------
  const { data: saved, error: saveError } = await userClient
    .from("clinics")
    .update({
      waba_phone_number_id: parsed.phoneNumberId,
      waba_business_id: parsed.businessId,
      whatsapp_enabled: parsed.enable,
    })
    .eq("id", clinic.id)
    .select("id, waba_phone_number_id, waba_business_id, whatsapp_enabled");

  if (saveError) {
    // 23505 = the partial unique index on clinics.waba_phone_number_id: another clinic already has it.
    // Two clinics on one number would mix patient replies across clinics, so it is a hard no.
    if (saveError.code === "23505") {
      const { data: owner } = await serviceClient
        .from("clinics")
        .select("id, name")
        .eq("waba_phone_number_id", parsed.phoneNumberId)
        .neq("id", clinic.id)
        .maybeSingle();
      return json(
        {
          error: "This WhatsApp number is already attached to another clinic. One number can belong to only one clinic.",
          error_code: "PHONE_NUMBER_IN_USE",
          conflict_clinic: owner ?? null,
        },
        409,
        cors,
      );
    }
    console.error(`admin-set-clinic-whatsapp: save failed (${saveError.code})`);
    return json({ error: "Could not save the number" }, 500, cors);
  }
  if (!saved || saved.length !== 1) {
    return json({ error: "Save changed 0 rows; nothing was saved" }, 500, cors);
  }

  // A template is needed before this clinic can really send (templates are per clinic in the app).
  const { count: templateCount } = await serviceClient
    .from("whatsapp_templates")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinic.id)
    .eq("is_default", true)
    .eq("approval_status", "approved");

  return json(
    {
      clinic_id: clinic.id,
      saved: true,
      waba_phone_number_id: saved[0].waba_phone_number_id,
      waba_business_id: saved[0].waba_business_id,
      whatsapp_enabled: saved[0].whatsapp_enabled,
      previous_waba_phone_number_id: clinic.waba_phone_number_id,
      has_approved_default_template: (templateCount ?? 0) > 0,
      ...metaInfo,
    },
    200,
    cors,
  );
});
