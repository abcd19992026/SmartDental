import { authorizeClinicOwner } from "../_shared/auth.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import {
  debugToken,
  exchangeCodeForToken,
  expiryToIso,
  generatePin,
  getPhoneNumberInfo,
  listWabaPhoneNumberIds,
  registerPhoneNumber,
  requestSmbAppDataSync,
  subscribeApp,
  tokenCoversWaba,
} from "../_shared/meta-embedded-signup.ts";
import { validateConnectWhatsAppRequest, type ConnectWhatsAppRequest } from "./validate.ts";

const ALREADY_CONNECTED_MESSAGE =
  "This WhatsApp number is already connected to another clinic. Please use a different number or contact support.";

Deno.serve(async (req) => {
  const cors = corsHeadersForRequest(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  // Same chain as create-staff-user (JWT -> getUser -> service-role profile lookup), narrowed to
  // the clinic OWNER. The clinic is taken from the caller's own profile; a clinic_id in the body
  // is never read.
  const auth = await authorizeClinicOwner(req);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status, cors);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }
  const validationErrors = validateConnectWhatsAppRequest(body);
  if (validationErrors) {
    return json({ error: "Validation failed", fields: validationErrors }, 400, cors);
  }
  const input = body as ConnectWhatsAppRequest;
  const { serviceClient, clinicId, userId } = auth;

  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appId || !appSecret) {
    console.error("META_APP_ID / META_APP_SECRET is not configured");
    return json({ error: "Server misconfigured" }, 500, cors);
  }

  // 1. The Embedded Signup code lives 30 seconds: exchange it before ANY database work.
  const exchange = await exchangeCodeForToken(appId, appSecret, input.code);
  if (!exchange.ok) {
    console.error(`connect-whatsapp: code exchange failed (meta code ${exchange.code})`);
    return json(
      {
        error: "This WhatsApp signup code was already used or has expired. Please start Connect WhatsApp again.",
        reason: "code_invalid",
      },
      400,
      cors,
    );
  }
  const token = exchange.data.access_token;

  // 2. Don't trust the ids from the browser. The token must really belong to our app, be valid, be
  //    granted on THIS waba_id, and that WABA must really contain THIS phone_number_id.
  const debug = await debugToken(appId, appSecret, token);
  if (!debug.ok) {
    console.error(`connect-whatsapp: debug_token failed (meta code ${debug.code})`);
    return json({ error: "Could not verify the WhatsApp token with Meta. Please try again." }, 502, cors);
  }
  if (debug.data.is_valid !== true || debug.data.app_id !== appId || !tokenCoversWaba(debug.data, input.waba_id)) {
    return json({ error: "This WhatsApp account could not be verified for the selected business.", reason: "waba_not_authorized" }, 403, cors);
  }
  const phoneIds = await listWabaPhoneNumberIds(input.waba_id, token);
  if (!phoneIds.ok) {
    console.error(`connect-whatsapp: phone_numbers lookup failed (meta code ${phoneIds.code})`);
    return json({ error: "Could not read the phone numbers of this WhatsApp account." }, 502, cors);
  }
  if (!phoneIds.data.includes(input.phone_number_id)) {
    return json({ error: "This phone number does not belong to the selected WhatsApp account.", reason: "phone_not_in_waba" }, 403, cors);
  }
  const tokenExpiresAt = expiryToIso(debug.data.expires_at);

  // 3. One number / WABA belongs to ONE clinic. Checked against live connections AND against
  //    clinics.waba_phone_number_id (a clinic still on the shared test number has no connection row).
  const { data: claimedByOther } = await serviceClient
    .from("clinic_whatsapp_connections")
    .select("clinic_id")
    .neq("clinic_id", clinicId)
    .neq("status", "disconnected")
    .or(`phone_number_id.eq.${input.phone_number_id},waba_id.eq.${input.waba_id}`)
    .limit(1);
  const { data: clinicHoldsNumber } = await serviceClient
    .from("clinics")
    .select("id")
    .neq("id", clinicId)
    .eq("waba_phone_number_id", input.phone_number_id)
    .limit(1);
  if ((claimedByOther?.length ?? 0) > 0 || (clinicHoldsNumber?.length ?? 0) > 0) {
    return json({ error: ALREADY_CONNECTED_MESSAGE, reason: "already_connected" }, 409, cors);
  }

  const { data: existing } = await serviceClient
    .from("clinic_whatsapp_connections")
    .select("clinic_id, created_by")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  // 4. Subscribe our webhook to this WABA. Whether this number is a coexistence number is decided by
  //    Meta (is_on_biz_app), not by the browser: a coexistence number is already registered, so it is
  //    neither registered again nor given a PIN.
  const subscribe = await subscribeApp(input.waba_id, token);
  if (!subscribe.ok) {
    console.error(`connect-whatsapp: subscribed_apps failed (meta code ${subscribe.code})`);
    return json({ error: "Could not subscribe to WhatsApp updates for this account. Please try again." }, 502, cors);
  }

  const phoneInfo = await getPhoneNumberInfo(input.phone_number_id, token);
  const coexistence = phoneInfo.ok
    ? phoneInfo.data.is_on_biz_app === true
    : input.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";

  let pin: string | null = null;
  if (!coexistence) {
    pin = generatePin();
    const registered = await registerPhoneNumber(input.phone_number_id, token, pin);
    if (!registered.ok) {
      console.error(`connect-whatsapp: register failed (meta code ${registered.code})`);
      return json({ error: "Could not register this phone number with WhatsApp. Please try again." }, 502, cors);
    }
  }

  // 5. Store. The token (and PIN) go to Vault; the table keeps only their ids.
  const storeSecret = async (kind: "token" | "pin", secret: string): Promise<string | null> => {
    const { data, error } = await serviceClient.rpc("store_clinic_whatsapp_secret", {
      p_clinic_id: clinicId,
      p_kind: kind,
      p_secret: secret,
    });
    return error || !data ? null : (data as string);
  };

  if (coexistence) {
    // A coexistence number has no PIN: drop one left over from an earlier standard setup of this clinic.
    await serviceClient.rpc("delete_clinic_whatsapp_secrets", { p_clinic_id: clinicId });
  }
  const tokenSecretId = await storeSecret("token", token);
  const pinSecretId = pin ? await storeSecret("pin", pin) : null;
  if (!tokenSecretId || (pin && !pinSecretId)) {
    console.error("connect-whatsapp: could not store a secret in Vault");
    return json({ error: "Could not save the WhatsApp connection. Please try again." }, 500, cors);
  }

  const nowIso = new Date().toISOString();
  const { error: upsertError } = await serviceClient.from("clinic_whatsapp_connections").upsert(
    {
      clinic_id: clinicId,
      waba_id: input.waba_id,
      phone_number_id: input.phone_number_id,
      business_id: input.business_id ?? null,
      status: "connected",
      coexistence,
      token_secret_id: tokenSecretId,
      token_expires_at: tokenExpiresAt,
      pin_secret_id: pinSecretId,
      connected_at: nowIso,
      last_checked_at: nowIso,
      last_error: null,
      sync_requested_at: null,
      created_by: existing?.created_by ?? userId,
    },
    { onConflict: "clinic_id" },
  );
  if (upsertError) {
    if (upsertError.code === "23505") {
      return json({ error: ALREADY_CONNECTED_MESSAGE, reason: "already_connected" }, 409, cors);
    }
    console.error(`connect-whatsapp: connection upsert failed (${upsertError.code})`);
    return json({ error: "Could not save the WhatsApp connection. Please try again." }, 500, cors);
  }

  // Keep clinics in step: the webhook finds the clinic by clinics.waba_phone_number_id. Automatic
  // sending stays OFF -- the clinic's templates were approved on a different WABA (or none exist yet),
  // so the owner switches it on once an approved template exists for THIS account.
  const { error: clinicUpdateError } = await serviceClient
    .from("clinics")
    .update({
      waba_phone_number_id: input.phone_number_id,
      waba_business_id: input.business_id ?? null,
      whatsapp_enabled: false,
    })
    .eq("id", clinicId);
  if (clinicUpdateError) {
    await serviceClient
      .from("clinic_whatsapp_connections")
      .update({ status: "error", last_error: "Connected, but the clinic record could not be updated. Please reconnect." })
      .eq("clinic_id", clinicId);
    if (clinicUpdateError.code === "23505") {
      return json({ error: ALREADY_CONNECTED_MESSAGE, reason: "already_connected" }, 409, cors);
    }
    console.error(`connect-whatsapp: clinic update failed (${clinicUpdateError.code})`);
    return json({ error: "Could not finish connecting WhatsApp. Please try again." }, 500, cors);
  }

  // 6. Coexistence only: ask WhatsApp for the one-time contacts + history sync (must happen within
  //    24 h of signup). We do NOT keep that data -- the webhook acknowledges and ignores it. A failed
  //    request is not fatal to the connection; it is recorded for the owner/support to see.
  const syncProblems: string[] = [];
  let syncRequested = false;
  if (coexistence) {
    for (const syncType of ["smb_app_state_sync", "history"] as const) {
      const sync = await requestSmbAppDataSync(input.phone_number_id, token, syncType);
      if (sync.ok) {
        syncRequested = true;
      } else {
        syncProblems.push(`${syncType}: ${sync.message}`.slice(0, 200));
      }
    }
    await serviceClient
      .from("clinic_whatsapp_connections")
      .update({
        sync_requested_at: syncRequested ? new Date().toISOString() : null,
        last_error: syncProblems.length > 0 ? `Contacts/history sync was not fully requested (${syncProblems.join("; ")})`.slice(0, 500) : null,
      })
      .eq("clinic_id", clinicId);
  }

  // Never the token, secret, code or PIN.
  await serviceClient.from("activity_log").insert({
    clinic_id: clinicId,
    user_id: userId,
    action: "whatsapp_connected",
    entity_type: "whatsapp_connection",
    entity_id: clinicId,
    meta: {
      waba_id: input.waba_id,
      phone_number_id: input.phone_number_id,
      coexistence,
      replaced_existing_connection: !!existing,
      token_expires_at: tokenExpiresAt,
      sync_requested: syncRequested,
      sync_problems: syncProblems,
      client_event: input.event ?? null,
    },
  });

  return json(
    {
      status: "connected",
      phone_number_id: input.phone_number_id,
      waba_id: input.waba_id,
      token_expires_at: tokenExpiresAt,
    },
    200,
    cors,
  );
});
