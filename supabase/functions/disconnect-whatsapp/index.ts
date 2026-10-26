import { authorizeClinicOwner } from "../_shared/auth.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { unsubscribeApp } from "../_shared/meta-embedded-signup.ts";

Deno.serve(async (req) => {
  const cors = corsHeadersForRequest(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  // Owner only, and only ever the caller's own clinic -- nothing is read from the body.
  const auth = await authorizeClinicOwner(req);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status, cors);
  }
  const { serviceClient, clinicId, userId } = auth;

  const { data: conn, error: connError } = await serviceClient
    .from("clinic_whatsapp_connections")
    .select("waba_id, phone_number_id, status")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (connError) {
    return json({ error: "Could not read the WhatsApp connection" }, 500, cors);
  }
  // A clinic still on the shared test number has no connection row: there is nothing of its own to
  // disconnect, and this must never wipe its current setup.
  if (!conn) {
    return json({ error: "This clinic has no connected WhatsApp account" }, 404, cors);
  }
  if (conn.status === "disconnected") {
    return json({ status: "disconnected" }, 200, cors);
  }

  // Best effort: stop Meta sending this WABA's webhooks to us. If the token is already dead this
  // fails, which must not stop the owner from disconnecting.
  let unsubscribed = false;
  const { data: token } = await serviceClient.rpc("get_clinic_whatsapp_token", { p_clinic_id: clinicId });
  if (typeof token === "string" && token.length > 0) {
    const result = await unsubscribeApp(conn.waba_id, token);
    unsubscribed = result.ok;
    if (!result.ok) {
      console.error(`disconnect-whatsapp: unsubscribe failed (meta code ${result.code})`);
    }
  }

  const { error: secretsError } = await serviceClient.rpc("delete_clinic_whatsapp_secrets", { p_clinic_id: clinicId });
  if (secretsError) {
    return json({ error: "Could not remove the stored WhatsApp credentials. Please try again." }, 500, cors);
  }

  const { error: updateError } = await serviceClient
    .from("clinic_whatsapp_connections")
    .update({
      status: "disconnected",
      token_secret_id: null,
      pin_secret_id: null,
      token_expires_at: null,
      last_error: null,
    })
    .eq("clinic_id", clinicId);
  if (updateError) {
    return json({ error: "Could not disconnect WhatsApp. Please try again." }, 500, cors);
  }

  const { error: clinicError } = await serviceClient
    .from("clinics")
    .update({ waba_phone_number_id: null, waba_business_id: null, whatsapp_enabled: false })
    .eq("id", clinicId);
  if (clinicError) {
    console.error(`disconnect-whatsapp: clinic update failed (${clinicError.code})`);
    return json({ error: "WhatsApp was disconnected, but the clinic record could not be updated." }, 500, cors);
  }

  await serviceClient.from("activity_log").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "whatsapp_disconnected",
    entity_type: "whatsapp_connection",
    entity_id: clinicId,
    meta: { waba_id: conn.waba_id, phone_number_id: conn.phone_number_id, webhook_unsubscribed: unsubscribed },
  });

  return json({ status: "disconnected" }, 200, cors);
});
