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
  const { data: clinic } = await serviceClient
    .from("clinics")
    .select("id")
    .eq("waba_phone_number_id", phoneNumberId)
    .maybeSingle();
  return clinic?.id ?? null;
}

async function handleStatusUpdate(serviceClient: SupabaseClient, clinicId: string, status: MetaStatus): Promise<void> {
  const waMessageId = status.id;
  const newStatus = status.status;
  if (!waMessageId || !newStatus || !(newStatus in STATUS_RANK)) return;

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

  await serviceClient.from("message_log").update(updates).eq("id", row.id);
}

async function handleInboundMessage(serviceClient: SupabaseClient, clinicId: string, message: MetaMessage): Promise<void> {
  const fromMobile = message.from;
  if (!fromMobile) return;

  // Patients are stored as bare 10-digit mobiles; Meta sends the number with the 91 country
  // code prefix.
  const mobile10 = fromMobile.startsWith("91") && fromMobile.length === 12 ? fromMobile.slice(2) : fromMobile;

  // Clinic-scoped lookup only -- a mobile number that exists in another clinic must never match
  // here. If no patient matches within THIS clinic, the event is logged and dropped, not
  // searched across tenants.
  const { data: patient } = await serviceClient
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("mobile", mobile10)
    .maybeSingle();

  if (!patient) {
    console.log(`Webhook: inbound message from ${fromMobile} matches no patient in clinic ${clinicId}, ignoring`);
    return;
  }

  const replyText = message.text?.body ?? null;

  const { data: recall } = await serviceClient
    .from("recalls")
    .select("id")
    .eq("patient_id", patient.id)
    .eq("clinic_id", clinicId)
    .in("status", ["pending", "sent"])
    .order("due_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!recall) {
    console.log(`Webhook: inbound message from patient ${patient.id} in clinic ${clinicId} has no open recall`);
    return;
  }

  await serviceClient
    .from("recalls")
    .update({
      status: "contacted",
      notes: replyText ? `Patient reply: ${replyText}` : "Patient replied (no text content)",
    })
    .eq("id", recall.id);
}

export async function processWebhookPayload(serviceClient: SupabaseClient, payload: MetaWebhookPayload): Promise<void> {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Multi-tenant demultiplexing: every event is resolved to a clinic BEFORE anything else
      // touches the database. No match -> log and ignore; never guess, never fall back.
      const clinicId = await resolveClinicIdForPhoneNumber(serviceClient, phoneNumberId);
      if (!clinicId) {
        console.log(`Webhook: no clinic matches phone_number_id ${phoneNumberId}, ignoring event`);
        continue;
      }

      for (const status of value?.statuses ?? []) {
        await handleStatusUpdate(serviceClient, clinicId, status);
      }
      for (const message of value?.messages ?? []) {
        await handleInboundMessage(serviceClient, clinicId, message);
      }
    }
  }
}
