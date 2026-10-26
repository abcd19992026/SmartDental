// Run:  deno test --no-check --allow-env supabase/functions/whatsapp-webhook/handlers_test.ts
import { processWebhookPayload, RECALL_REPLY_WINDOW_DAYS } from "./handlers.ts";
import { type Any, calls, check, fakeClient, type FakeOp, firstArg, has } from "../_shared/fake-supabase.ts";

Deno.env.set("META_APP_ID", "1729613974958031");

const DAY_MS = 24 * 60 * 60 * 1000;
const updatesStatus = (o: FakeOp, status?: string) =>
  o.ops.some(([n, a]) => n === "update" && (status ? (a[0] as Any).status === status : !!(a[0] as Any).status));
const connLookup = (op: FakeOp) => op.table === "clinic_whatsapp_connections" && op.ops.some(([n]) => n === "maybeSingle");

// ---------------------------------------------------------------------------------------------
// account_update + ignored coexistence fields
// ---------------------------------------------------------------------------------------------

Deno.test("account_update PARTNER_REMOVED: WABA read from waba_info.waba_id (not entry.id) -> needs_reconnect", async () => {
  const { client, log } = fakeClient((op) => connLookup(op) ? { data: { clinic_id: "c1", status: "connected" }, error: null } : { data: null, error: null });
  await processWebhookPayload(client, { entry: [{ id: "PARTNER_WABA_999", changes: [{ field: "account_update", value: { event: "PARTNER_REMOVED", waba_info: { waba_id: "CUSTOMER_WABA_1" } } }] }] });
  check(log.some((o) => o.table === "clinic_whatsapp_connections" && has(o, "eq", "waba_id", "CUSTOMER_WABA_1")), "looked up by waba_info.waba_id");
  check(!log.some((o) => has(o, "eq", "waba_id", "PARTNER_WABA_999")), "did NOT look up by entry.id");
  check(log.some((o) => updatesStatus(o, "needs_reconnect")), "status set to needs_reconnect");
  check(log.some((o) => o.table === "activity_log"), "activity_log written");
});

Deno.test("account_update falls back to entry.id when waba_info is absent", async () => {
  const { client, log } = fakeClient(() => ({ data: null, error: null }));
  await processWebhookPayload(client, { entry: [{ id: "W_ENTRY", changes: [{ field: "account_update", value: { event: "ACCOUNT_DELETED" } }] }] });
  check(log.some((o) => has(o, "eq", "waba_id", "W_ENTRY")), "fallback to entry.id");
});

Deno.test("PARTNER_APP_UNINSTALLED for ANOTHER app is ignored (no status change)", async () => {
  const { client, log } = fakeClient((op) => op.table === "clinic_whatsapp_connections" ? { data: { clinic_id: "c1", status: "connected" }, error: null } : { data: null, error: null });
  await processWebhookPayload(client, { entry: [{ id: "x", changes: [{ field: "account_update", value: { event: "PARTNER_APP_UNINSTALLED", waba_info: { waba_id: "W1", partner_app_id: "5555" } } }] }] });
  check(!log.some((o) => updatesStatus(o)), "no status update");
  const audit = log.find((o) => o.table === "activity_log");
  check(!!audit && JSON.stringify(audit.ops).includes('"ignored_other_app":true'), "logged as ignored_other_app");
});

Deno.test("PARTNER_APP_UNINSTALLED for OUR app -> needs_reconnect", async () => {
  const { client, log } = fakeClient((op) => op.table === "clinic_whatsapp_connections" ? { data: { clinic_id: "c1", status: "connected" }, error: null } : { data: null, error: null });
  await processWebhookPayload(client, { entry: [{ id: "x", changes: [{ field: "account_update", value: { event: "PARTNER_APP_UNINSTALLED", waba_info: { waba_id: "W1", partner_app_id: "1729613974958031" } } }] }] });
  check(log.some((o) => updatesStatus(o, "needs_reconnect")), "needs_reconnect");
});

Deno.test("ACCOUNT_DELETED -> disconnected, secrets removed, clinic fields cleared", async () => {
  const { client, log, rpcLog } = fakeClient((op) => connLookup(op) ? { data: { clinic_id: "c1", status: "connected" }, error: null } : { data: null, error: null });
  await processWebhookPayload(client, { entry: [{ id: "W1", changes: [{ field: "account_update", value: { event: "ACCOUNT_DELETED" } }] }] });
  check(log.some((o) => updatesStatus(o, "disconnected")), "disconnected");
  check(rpcLog.some(([n]) => n === "delete_clinic_whatsapp_secrets"), "vault secrets deleted");
  check(log.some((o) => o.table === "clinics" && o.ops.some(([n, a]) => n === "update" && (a[0] as Any).whatsapp_enabled === false)), "clinic fields cleared");
});

Deno.test("unknown account_update event: logged, nothing changed, no throw", async () => {
  const { client, log } = fakeClient((op) => op.table === "clinic_whatsapp_connections" ? { data: { clinic_id: "c1", status: "connected" }, error: null } : { data: null, error: null });
  await processWebhookPayload(client, { entry: [{ id: "W1", changes: [{ field: "account_update", value: { event: "SOME_FUTURE_EVENT", waba_info: { waba_id: "W1" } } }] }] });
  check(!log.some((o) => o.ops.some(([n]) => n === "update")), "no updates");
});

Deno.test("history / smb_app_state_sync / smb_message_echoes / unknown fields: ZERO database calls", async () => {
  const { client, log, rpcLog } = fakeClient(() => ({ data: null, error: null }));
  const meta = { phone_number_id: "P1", display_phone_number: "1" };
  await processWebhookPayload(client, {
    entry: [{
      id: "W1",
      changes: [
        { field: "history", value: { metadata: meta, history: [{ threads: [{ id: "919999999999", messages: [{ from: "919999999999", text: { body: "old private chat" } }] }] }] } as Any },
        { field: "smb_app_state_sync", value: { metadata: meta, state_sync: [{ type: "contact" }] } as Any },
        { field: "smb_message_echoes", value: { metadata: meta, message_echoes: [{ text: { body: "echo" } }] } as Any },
        { field: "brand_new_future_field", value: { metadata: meta, messages: [{ from: "919999999999", text: { body: "x" } }] } },
      ],
    }],
  });
  check(log.length === 0 && rpcLog.length === 0, `expected no DB calls, got ${log.length} from() and ${rpcLog.length} rpc`);
});

Deno.test("normal messages change still demuxes by phone_number_id (unchanged behaviour)", async () => {
  const { client, log } = fakeClient(() => ({ data: null, error: null }));
  await processWebhookPayload(client, { entry: [{ id: "W1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "P1" }, statuses: [{ id: "wamid", status: "sent" }] } }] }] });
  check(log.some((o) => o.table === "clinics" && has(o, "eq", "waba_phone_number_id", "P1")), "clinic lookup by phone_number_id");
});

Deno.test("a change with NO field (legacy shape) is still processed as messages", async () => {
  const { client, log } = fakeClient(() => ({ data: null, error: null }));
  await processWebhookPayload(client, { entry: [{ changes: [{ value: { metadata: { phone_number_id: "P2" }, statuses: [] } }] }] });
  check(log.some((o) => o.table === "clinics" && has(o, "eq", "waba_phone_number_id", "P2")), "processed");
});

Deno.test("account_update handler error does not stop later changes in the same payload", async () => {
  let n = 0;
  const { client, log } = fakeClient((op) => {
    if (op.table === "clinic_whatsapp_connections") {
      n++;
      throw new Error("db exploded");
    }
    return { data: null, error: null };
  });
  await processWebhookPayload(client, {
    entry: [{
      id: "W1",
      changes: [
        { field: "account_update", value: { event: "PARTNER_REMOVED", waba_info: { waba_id: "W1" } } },
        { field: "messages", value: { metadata: { phone_number_id: "P9" }, statuses: [] } },
      ],
    }],
  });
  check(n === 1 && log.some((o) => o.table === "clinics" && has(o, "eq", "waba_phone_number_id", "P9")), "message change after the failing account_update was still processed");
});

// ---------------------------------------------------------------------------------------------
// Recall-reply gate: a patient message is a recall reply only within 7 days of a recall message we sent
// ---------------------------------------------------------------------------------------------

interface Scenario {
  /** When we last sent this patient a (qualifying) recall message, ms since epoch; null = never. */
  recallSentAtMs: number | null;
  /** Patient's message time in unix SECONDS as a string, or undefined to omit Meta's timestamp. */
  messageTimestampSec?: string;
  gateError?: boolean;
  /** Recall rows: the "active" lookup (status in pending/sent) and the "any recall" fallback. */
  activeRecall?: { id: string; status: string } | null;
  fallbackRecall?: { id: string; status: string } | null;
  patientFound?: boolean;
}

function inboundPayload(timestamp: string | undefined, body = "ok, I will come") {
  return {
    entry: [{
      id: "W1",
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: "P1" },
          messages: [{ from: "919999999999", ...(timestamp ? { timestamp } : {}), text: { body } }],
        },
      }],
    }],
  };
}

async function runInbound(s: Scenario) {
  const { client, log } = fakeClient((op) => {
    if (op.table === "clinics") return { data: { id: "clinic1" }, error: null };
    if (op.table === "patients") return { data: s.patientFound === false ? null : { id: "p1" }, error: null };
    if (op.table === "message_log") {
      if (s.gateError) return { data: null, error: { message: "boom" } };
      // Decide from the cutoff the handler ACTUALLY passed to .gte("sent_at", ...).
      const cutoff = Date.parse(firstArg(op, "gte") === undefined ? "" : String(op.ops.find(([n]) => n === "gte")![1][1]));
      const qualifies = s.recallSentAtMs !== null && s.recallSentAtMs >= cutoff;
      return { data: qualifies ? [{ id: "m1" }] : [], error: null };
    }
    if (op.table === "recalls" && op.ops.some(([n]) => n === "maybeSingle")) {
      const isActiveLookup = op.ops.some(([n]) => n === "in");
      const row = isActiveLookup
        ? (s.activeRecall === undefined ? { id: "r1", status: "sent" } : s.activeRecall)
        : (s.fallbackRecall === undefined ? null : s.fallbackRecall);
      return { data: row, error: null };
    }
    return { data: null, error: null };
  });
  await processWebhookPayload(client, inboundPayload(s.messageTimestampSec));
  const recallUpdates = log.filter((o) => o.table === "recalls" && o.ops.some(([n]) => n === "update"));
  return { log, recallUpdates };
}

const nowSec = () => String(Math.floor(Date.now() / 1000));

Deno.test("reply within 7 days of a recall message -> recall becomes contacted (old behaviour kept)", async () => {
  const { recallUpdates } = await runInbound({ recallSentAtMs: Date.now() - 1 * DAY_MS, messageTimestampSec: nowSec() });
  check(recallUpdates.length === 1, "recall updated once");
  const u = firstArg(recallUpdates[0], "update") as Any;
  check(u.status === "contacted", "pending/sent -> contacted");
  check(u.notes === "Patient reply: ok, I will come", "reply text stored in notes");
  check(typeof u.reply_received_at === "string" && u.reply_dismissed_at === null, "reply_received_at stamped, dismissal reset");
  check(has(recallUpdates[0], "eq", "id", "r1"), "updates the matched recall");
});

Deno.test("normal chat with NO recall message ever sent -> ignored, recalls untouched", async () => {
  const { log, recallUpdates } = await runInbound({ recallSentAtMs: null, messageTimestampSec: nowSec() });
  check(recallUpdates.length === 0, "no recall update");
  check(!log.some((o) => o.table === "recalls"), "recalls table not even queried");
});

Deno.test("message 8 days after the last recall message -> normal chat, ignored", async () => {
  const { log, recallUpdates } = await runInbound({ recallSentAtMs: Date.now() - 8 * DAY_MS, messageTimestampSec: nowSec() });
  check(recallUpdates.length === 0 && !log.some((o) => o.table === "recalls"), "ignored");
});

Deno.test("window edge: 1 s inside the 7 days is a reply, 1 s outside is not", async () => {
  const t = Date.now();
  const tsSec = String(Math.floor(t / 1000));
  const msgMs = Number(tsSec) * 1000;
  const inside = await runInbound({ recallSentAtMs: msgMs - RECALL_REPLY_WINDOW_DAYS * DAY_MS + 1000, messageTimestampSec: tsSec });
  check(inside.recallUpdates.length === 1, "7 days minus 1 s -> accepted");
  const outside = await runInbound({ recallSentAtMs: msgMs - RECALL_REPLY_WINDOW_DAYS * DAY_MS - 1000, messageTimestampSec: tsSec });
  check(outside.recallUpdates.length === 0, "7 days plus 1 s -> ignored");
});

Deno.test("the window is measured from the patient's message time (Meta timestamp), not from 'now'", async () => {
  // A delayed/replayed webhook: patient wrote 30 days ago, one day after we sent the recall message.
  const msgMs = Date.now() - 30 * DAY_MS;
  const accepted = await runInbound({ recallSentAtMs: msgMs - 1 * DAY_MS, messageTimestampSec: String(Math.floor(msgMs / 1000)) });
  check(accepted.recallUpdates.length === 1, "reply that was timely when written is still a reply");
  // Same recall message, but the patient's message is 30 days later -> chat.
  const late = await runInbound({ recallSentAtMs: Date.now() - 30 * DAY_MS, messageTimestampSec: nowSec() });
  check(late.recallUpdates.length === 0, "message long after the recall message is ignored");
});

Deno.test("no timestamp on the message -> falls back to now", async () => {
  const fresh = await runInbound({ recallSentAtMs: Date.now() - 2 * DAY_MS });
  check(fresh.recallUpdates.length === 1, "recent recall message + no timestamp -> accepted");
  const stale = await runInbound({ recallSentAtMs: Date.now() - 9 * DAY_MS });
  check(stale.recallUpdates.length === 0, "old recall message + no timestamp -> ignored");
});

Deno.test("the gate only counts real, delivered recall messages for THIS patient in THIS clinic", async () => {
  const { log } = await runInbound({ recallSentAtMs: Date.now() - 1 * DAY_MS, messageTimestampSec: nowSec() });
  const gate = log.find((o) => o.table === "message_log")!;
  check(has(gate, "eq", "clinic_id", "clinic1"), "scoped to the resolved clinic");
  check(has(gate, "eq", "patient_id", "p1"), "scoped to the matched patient");
  check(has(gate, "eq", "message_type", "recall"), "payment/prescription messages do not open the window");
  check(has(gate, "eq", "is_test", false), "test sends do not open the window");
  check(has(gate, "not", "recall_id", "is", null), "must be tied to an actual recall");
  check(has(gate, "in", "status", ["sent", "delivered", "read"]), "failed/queued sends do not open the window");
  check(calls(gate, "gte").length === 1, "one lower bound on sent_at");
});

Deno.test("if the recall-message lookup fails, the message is ignored (fail closed)", async () => {
  const { log, recallUpdates } = await runInbound({ recallSentAtMs: Date.now(), messageTimestampSec: nowSec(), gateError: true });
  check(recallUpdates.length === 0 && !log.some((o) => o.table === "recalls"), "no recall touched on a guess");
});

Deno.test("old behaviour inside the window: an already-booked recall keeps its status, reply still recorded", async () => {
  const { recallUpdates } = await runInbound({ recallSentAtMs: Date.now() - 1 * DAY_MS, messageTimestampSec: nowSec(), activeRecall: { id: "r2", status: "booked" } });
  check(recallUpdates.length === 1, "reply recorded");
  const u = firstArg(recallUpdates[0], "update") as Any;
  check(!("status" in u), "status of an already-actioned recall is left alone");
  check(typeof u.reply_received_at === "string", "reply_received_at still stamped");
});

Deno.test("old behaviour inside the window: no active recall -> falls back to the most recent recall", async () => {
  const { recallUpdates } = await runInbound({
    recallSentAtMs: Date.now() - 1 * DAY_MS,
    messageTimestampSec: nowSec(),
    activeRecall: null,
    fallbackRecall: { id: "r_old", status: "completed" },
  });
  check(recallUpdates.length === 1 && has(recallUpdates[0], "eq", "id", "r_old"), "fallback recall gets the reply");
  check(!("status" in (firstArg(recallUpdates[0], "update") as Any)), "completed stays completed");
});

Deno.test("patient not in this clinic -> ignored before the gate (unchanged)", async () => {
  const { log } = await runInbound({ recallSentAtMs: Date.now(), messageTimestampSec: nowSec(), patientFound: false });
  check(!log.some((o) => o.table === "message_log" || o.table === "recalls"), "nothing else queried");
});

Deno.test("reply with no text body inside the window -> 'Patient replied (no text content)'", async () => {
  const { client, log } = fakeClient((op) => {
    if (op.table === "clinics") return { data: { id: "clinic1" }, error: null };
    if (op.table === "patients") return { data: { id: "p1" }, error: null };
    if (op.table === "message_log") return { data: [{ id: "m1" }], error: null };
    if (op.table === "recalls" && op.ops.some(([n]) => n === "maybeSingle")) return { data: { id: "r1", status: "pending" }, error: null };
    return { data: null, error: null };
  });
  await processWebhookPayload(client, { entry: [{ id: "W1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "P1" }, messages: [{ from: "919999999999", timestamp: nowSec() }] } }] }] });
  const upd = log.find((o) => o.table === "recalls" && o.ops.some(([n]) => n === "update"))!;
  check((firstArg(upd, "update") as Any).notes === "Patient replied (no text content)", "no-text reply note");
});
