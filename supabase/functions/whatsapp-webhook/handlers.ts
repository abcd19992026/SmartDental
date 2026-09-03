import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface MetaStatus {
  id?: string;
  status?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

interface MetaMessage {
  from?: string;
  text?: { body?: string };
}

interface MetaValue {
  metadata?: { phone_number_id?: string };
  statuses?: MetaStatus[];
  messages?: MetaMessage[];
}

interface MetaWebhookPayload {
  entry?: Array<{ changes?: Array<{ value?: MetaValue }> }>;
}

// Ordering used to guard against out-of-order delivery: a 'sent' event arriving after a 'read'
// event must never move message_log.status backwards.
const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

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
  console.log(`Webhook: inbound message event -- from=${fromMobile}, clinic=${clinicId}, hasText=${!!message.text?.body}`);
  if (!fromMobile) {
    console.log("Webhook: inbound message skipped -- no 'from' field");
    return;
  }

  // Patients are stored as bare 10-digit mobiles; Meta sends the number with the 91 country
  // code prefix.
  const mobile10 = fromMobile.startsWith("91") && fromMobile.length === 12 ? fromMobile.slice(2) : fromMobile;
  console.log(`Webhook: normalized mobile ${fromMobile} -> ${mobile10}`);

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
    console.log(`Webhook: inbound message from ${fromMobile} (normalized ${mobile10}) matches no patient in clinic ${clinicId}, ignoring`);
    return;
  }
  console.log(`Webhook: matched patient ${patient.id}`);

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
  // reply_received_at is what actually drives the Today page's "Replies Waiting" visibility --
  // deliberately independent of status. It's stamped on every reply, unconditionally, so a
  // recall that's already declined/booked/etc. still surfaces a new reply instead of the message
  // silently vanishing into notes with no visible signal. Dismissing a card (reply_dismissed_at,
  // set client-side) only ever hides THIS reply; a later reply bumps reply_received_at again and
  // reply_dismissed_at < reply_received_at makes the card reappear.
  const updates: Record<string, unknown> = {
    notes: replyText ? `Patient reply: ${replyText}` : "Patient replied (no text content)",
    reply_received_at: new Date().toISOString(),
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

export async function processWebhookPayload(serviceClient: SupabaseClient, payload: MetaWebhookPayload): Promise<void> {
  console.log(`Webhook: processing payload with ${payload.entry?.length ?? 0} entries`);
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
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
