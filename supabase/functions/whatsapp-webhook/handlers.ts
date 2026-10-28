import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface MetaStatus {
  id?: string;
  status?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

interface MetaMessage {
  from?: string;
  /** Unix seconds, as a string -- when the patient sent it. */
  timestamp?: string;
  text?: { body?: string };
}

/** A patient's message only counts as a recall REPLY if we sent them a recall message within this
 * many days. With coexistence the clinic also chats with patients on the same number, and ordinary
 * chat must not mark a recall "contacted" (which stops the reminder ladder). */
export const RECALL_REPLY_WINDOW_DAYS = 7;

interface MetaValue {
  metadata?: { phone_number_id?: string };
  statuses?: MetaStatus[];
  messages?: MetaMessage[];
  // account_update fields
  event?: string;
  waba_info?: { waba_id?: string; partner_app_id?: string };
  ban_info?: { waba_ban_state?: string };
}

interface MetaWebhookPayload {
  entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: MetaValue }> }>;
}

// account_update events that mean our access to the clinic's WABA is gone or must be redone.
// Names are exactly as listed in Meta's account_update webhook reference.
const RECONNECT_EVENTS = new Set(["PARTNER_REMOVED", "PARTNER_APP_UNINSTALLED", "ACCOUNT_OFFBOARDED"]);
const DISCONNECT_EVENTS = new Set(["ACCOUNT_DELETED"]);
const ERROR_EVENTS = new Set(["DISABLED_UPDATE"]);

// Ordering used to guard against out-of-order delivery: a 'sent' event arriving after a 'read'
// event must never move message_log.status backwards.
const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/** For logs only: a patient's mobile number must never be printed in full. Keeps the last 4 digits
 * ("919876543210" -> "********3210"); anything of 4 characters or fewer is fully masked. */
export function maskPhone(value: string | undefined | null): string {
  if (!value) return "(none)";
  if (value.length <= 4) return "*".repeat(value.length);
  return "*".repeat(value.length - 4) + value.slice(-4);
}

async function resolveClinicIdForPhoneNumber(
  serviceClient: SupabaseClient,
  phoneNumberId: string,
): Promise<string | null> {
  const { data: clinic, error } = await serviceClient
    .from("clinics")
    .select("id")
    .eq("waba_phone_number_id", phoneNumberId)
    .maybeSingle();
  if (error) {
    console.log(`Webhook: clinic lookup for phone_number_id ${phoneNumberId} errored: ${error.message}`);
  }
  return clinic?.id ?? null;
}

async function handleStatusUpdate(serviceClient: SupabaseClient, clinicId: string, status: MetaStatus): Promise<void> {
  const waMessageId = status.id;
  const newStatus = status.status;
  console.log(`Webhook: status event -- wa_message_id=${waMessageId}, status=${newStatus}, clinic=${clinicId}`);
  if (!waMessageId || !newStatus || !(newStatus in STATUS_RANK)) {
    console.log(`Webhook: status event skipped -- missing id/status or unrecognized status "${newStatus}"`);
    return;
  }

  // Scoped to this clinic even though wa_message_id should already be globally unique -- this is
  // the same "resolve the clinic first, never touch data outside it" rule the inbound-message
  // path follows, applied here as defense in depth.
  const { data: row } = await serviceClient
    .from("message_log")
    .select("id, status")
    .eq("wa_message_id", waMessageId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (!row) {
    console.log(`Webhook: no message_log row for wa_message_id ${waMessageId} under clinic ${clinicId}, ignoring`);
    return;
  }

  const currentRank = STATUS_RANK[row.status ?? ""] ?? -1;
  const newRank = STATUS_RANK[newStatus];
  if (newRank < currentRank) {
    console.log(
      `Webhook: ignoring out-of-order status "${newStatus}" (current "${row.status}") for message_log ${row.id}`,
    );
    return;
  }

  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === "failed" && status.errors?.[0]) {
    updates.error_code = status.errors[0].code != null ? String(status.errors[0].code) : null;
    updates.error_message = status.errors[0].title ?? status.errors[0].message ?? null;
  }

  const { error: updateError } = await serviceClient.from("message_log").update(updates).eq("id", row.id);
  console.log(
    `Webhook: message_log ${row.id} status "${row.status}" -> "${newStatus}" ${
      updateError ? `FAILED: ${updateError.message}` : "OK"
    }`,
  );
}

async function handleInboundMessage(serviceClient: SupabaseClient, clinicId: string, message: MetaMessage): Promise<void> {
  const fromMobile = message.from;
  console.log(`Webhook: inbound message event -- from=${maskPhone(fromMobile)}, clinic=${clinicId}, hasText=${!!message.text?.body}`);
  if (!fromMobile) {
    console.log("Webhook: inbound message skipped -- no 'from' field");
    return;
  }

  // Patients are stored as bare 10-digit mobiles; Meta sends the number with the 91 country
  // code prefix.
  const mobile10 = fromMobile.startsWith("91") && fromMobile.length === 12 ? fromMobile.slice(2) : fromMobile;
  console.log(`Webhook: normalized mobile ${maskPhone(fromMobile)} -> ${maskPhone(mobile10)}`);

  // Clinic-scoped lookup only -- a mobile number that exists in another clinic must never match
  // here. If no patient matches within THIS clinic, the event is logged and dropped, not
  // searched across tenants.
  const { data: patient, error: patientError } = await serviceClient
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("mobile", mobile10)
    .maybeSingle();

  if (patientError) {
    console.log(`Webhook: patient lookup errored: ${patientError.message}`);
  }
  if (!patient) {
    console.log(`Webhook: inbound message from ${maskPhone(fromMobile)} matches no patient in clinic ${clinicId}, ignoring`);
    return;
  }
  console.log(`Webhook: matched patient ${patient.id}`);

  // Recall-reply gate: only a message that arrives within RECALL_REPLY_WINDOW_DAYS of a recall
  // message we actually sent this patient is a reply. Measured from the patient's own message time
  // (Meta's timestamp) so a late or replayed webhook is judged by when the patient wrote, falling
  // back to "now" when it is missing. Payment/prescription messages, test sends and failed sends
  // are not recall messages, so they do not open the window.
  const messageTimeMs = message.timestamp && /^\d+$/.test(message.timestamp) ? Number(message.timestamp) * 1000 : Date.now();
  const windowStartIso = new Date(messageTimeMs - RECALL_REPLY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRecallMessage, error: recentRecallError } = await serviceClient
    .from("message_log")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patient.id)
    .eq("message_type", "recall")
    .eq("is_test", false)
    .not("recall_id", "is", null)
    .in("status", ["sent", "delivered", "read"])
    .gte("sent_at", windowStartIso)
    .limit(1);
  if (recentRecallError) {
    // Fail closed: if we cannot tell, do not change a recall on a guess.
    console.log(`Webhook: recall-message lookup errored: ${recentRecallError.message}, ignoring message`);
    return;
  }
  if (!recentRecallMessage || recentRecallMessage.length === 0) {
    console.log(
      `Webhook: message from patient ${patient.id} is not within ${RECALL_REPLY_WINDOW_DAYS} days of a recall message, ` +
        `treating as normal chat and ignoring`,
    );
    return;
  }

  const replyText = message.text?.body ?? null;

  // Prefer the recall currently awaiting contact (pending/sent), most recently created.
  let { data: recall, error: recallError } = await serviceClient
    .from("recalls")
    .select("id, status")
    .eq("patient_id", patient.id)
    .eq("clinic_id", clinicId)
    .in("status", ["pending", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recallError) {
    console.log(`Webhook: active recall lookup errored: ${recallError.message}`);
  }

  // No active recall (e.g. patient replying after everything's already actioned) --
  // fall back to the most recently created recall overall, so the reply is still
  // captured somewhere instead of being dropped.
  if (!recall) {
    const fallback = await serviceClient
      .from("recalls")
      .select("id, status")
      .eq("patient_id", patient.id)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback.error) {
      console.log(`Webhook: fallback recall lookup errored: ${fallback.error.message}`);
    }
    recall = fallback.data;
  }
  if (!recall) {
    console.log(`Webhook: inbound message from patient ${patient.id} in clinic ${clinicId} matches no recall at all`);
    return;
  }

  // Notes always reflect the latest reply so staff never lose visibility into what the patient
  // said. Status only advances pending/sent -> contacted (first contact); an already-actioned
  // status (contacted, booked, declined, completed, paused, failed) is left alone -- a later
  // reply must never silently reopen a decision staff already made.
  //
  // reply_received_at is stamped on every reply, unconditionally, so a recall that's already
  // declined/booked/etc. still records a new reply instead of the message silently vanishing
  // into notes with no visible signal.
  //
  // reply_dismissed_at is reset to null here, unconditionally, alongside it: dismissing a card
  // (client-side "X" button) only ever hides the reply that existed at dismiss time -- a NEW
  // reply must always clear that hide so the Today page's "Replies Waiting" query (which filters
  // reply_dismissed_at IS NULL) surfaces the card again. This only touches the notes/reply-
  // tracking fields, same as reply_received_at -- it never touches status, so a staff decision
  // (booked/declined/etc.) is exactly as untouched by this update as it already was.
  const updates: Record<string, unknown> = {
    notes: replyText ? `Patient reply: ${replyText}` : "Patient replied (no text content)",
    reply_received_at: new Date().toISOString(),
    reply_dismissed_at: null,
  };
  if (recall.status === "pending" || recall.status === "sent") {
    updates.status = "contacted";
  }
  console.log(
    `Webhook: matched recall ${recall.id} (current status "${recall.status}"), ` +
      `${updates.status ? "advancing to contacted, " : "leaving status unchanged, "}updating notes`,
  );

  const { error: updateError } = await serviceClient.from("recalls").update(updates).eq("id", recall.id);
  console.log(`Webhook: recall ${recall.id} update ${updateError ? `FAILED: ${updateError.message}` : "OK"}`);
}

/** account_update: the WABA is read from waba_info.waba_id when present -- for partner events
 * entry.id is NOT the customer's WABA id (Meta's own PARTNER_ADDED example shows two different ids)
 * -- and only falls back to entry.id when waba_info is absent. Unknown events are logged and ignored. */
async function handleAccountUpdate(serviceClient: SupabaseClient, entryId: string | undefined, value: MetaValue | undefined): Promise<void> {
  const event = value?.event;
  const wabaId = value?.waba_info?.waba_id ?? entryId;
  console.log(`Webhook: account_update -- event=${event}, waba_id=${wabaId}`);
  if (!event || !wabaId) return;

  const { data: conn } = await serviceClient
    .from("clinic_whatsapp_connections")
    .select("clinic_id, status")
    .eq("waba_id", wabaId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (!conn) {
    console.log(`Webhook: account_update for waba_id ${wabaId} matches no connected clinic, ignoring`);
    return;
  }

  // PARTNER_APP_UNINSTALLED names the app that was removed: only act when it is OUR app.
  const ourAppId = Deno.env.get("META_APP_ID");
  const partnerAppId = value?.waba_info?.partner_app_id;
  const aboutOtherApp = event === "PARTNER_APP_UNINSTALLED" && !!partnerAppId && !!ourAppId && partnerAppId !== ourAppId;

  let newStatus: "needs_reconnect" | "disconnected" | "error" | null = null;
  let lastError: string | null = null;
  if (!aboutOtherApp) {
    if (RECONNECT_EVENTS.has(event)) {
      newStatus = "needs_reconnect";
      lastError = "WhatsApp access was removed on the WhatsApp side. Please reconnect WhatsApp.";
    } else if (DISCONNECT_EVENTS.has(event)) {
      newStatus = "disconnected";
    } else if (ERROR_EVENTS.has(event)) {
      newStatus = "error";
      lastError = "Meta reports this WhatsApp account is disabled.";
    }
  }

  // Only a still-live connection is moved; an already-flagged one is not overwritten.
  if (newStatus && (conn.status === "connected" || (newStatus === "disconnected" && conn.status !== "disconnected"))) {
    const update: Record<string, unknown> = { status: newStatus, last_error: lastError };
    if (newStatus === "disconnected") {
      update.token_secret_id = null;
      update.pin_secret_id = null;
      update.token_expires_at = null;
    }
    const { error } = await serviceClient.from("clinic_whatsapp_connections").update(update).eq("clinic_id", conn.clinic_id);
    if (error) console.log(`Webhook: could not update connection for clinic ${conn.clinic_id}: ${error.message}`);
    if (!error && newStatus === "disconnected") {
      await serviceClient.rpc("delete_clinic_whatsapp_secrets", { p_clinic_id: conn.clinic_id });
      await serviceClient
        .from("clinics")
        .update({ waba_phone_number_id: null, waba_business_id: null, whatsapp_enabled: false })
        .eq("id", conn.clinic_id);
    }
  }

  await serviceClient.from("activity_log").insert({
    clinic_id: conn.clinic_id,
    user_id: null,
    action: "whatsapp_account_update",
    entity_type: "whatsapp_connection",
    entity_id: conn.clinic_id,
    meta: { actor_type: "system", event, waba_id: wabaId, status_set: newStatus, ignored_other_app: aboutOtherApp },
  });
}

export async function processWebhookPayload(serviceClient: SupabaseClient, payload: MetaWebhookPayload): Promise<void> {
  console.log(`Webhook: processing payload with ${payload.entry?.length ?? 0} entries`);
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      // Coexistence adds fields (history, smb_app_state_sync, smb_message_echoes, ...) that carry the
      // clinic's old chats and contacts. We deliberately do not store any of it: acknowledge and move
      // on. An unknown field must never break message/status processing below, so everything that is
      // not `messages` (or a change with no field at all, kept for compatibility) is skipped here.
      if (change.field === "account_update") {
        try {
          await handleAccountUpdate(serviceClient, entry.id, value);
        } catch (err) {
          console.log(`Webhook: account_update handling errored: ${err instanceof Error ? err.message : "unknown"}`);
        }
        continue;
      }
      if (change.field !== undefined && change.field !== "messages") {
        console.log(`Webhook: ignoring unhandled field "${change.field}"`);
        continue;
      }

      const phoneNumberId = value?.metadata?.phone_number_id;
      console.log(
        `Webhook: change -- phone_number_id=${phoneNumberId}, ` +
          `statusesCount=${value?.statuses?.length ?? 0}, messagesCount=${value?.messages?.length ?? 0}`,
      );
      if (!phoneNumberId) {
        console.log("Webhook: change skipped -- no phone_number_id in metadata");
        continue;
      }

      // Multi-tenant demultiplexing: every event is resolved to a clinic BEFORE anything else
      // touches the database. No match -> log and ignore; never guess, never fall back.
      const clinicId = await resolveClinicIdForPhoneNumber(serviceClient, phoneNumberId);
      if (!clinicId) {
        console.log(`Webhook: no clinic matches phone_number_id ${phoneNumberId}, ignoring event`);
        continue;
      }
      console.log(`Webhook: phone_number_id ${phoneNumberId} resolved to clinic ${clinicId}`);

      for (const status of value?.statuses ?? []) {
        await handleStatusUpdate(serviceClient, clinicId, status);
      }
      for (const message of value?.messages ?? []) {
        await handleInboundMessage(serviceClient, clinicId, message);
      }
    }
  }
}
