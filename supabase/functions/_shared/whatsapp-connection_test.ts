// Run:  deno test --no-check --allow-env supabase/functions/_shared/whatsapp-connection_test.ts
import { logSendSkippedOnce, noteGraphAuthFailure, resolveWhatsappCredentials } from "./whatsapp-connection.ts";
import { expiryToIso, generatePin, tokenCoversWaba } from "./meta-embedded-signup.ts";
import { validateConnectWhatsAppRequest } from "../connect-whatsapp/validate.ts";
import { type Any, check, fakeClient, type FakeOp } from "./fake-supabase.ts";

const updatesStatus = (o: FakeOp, status: string) =>
  o.ops.some(([n, a]) => n === "update" && (a[0] as Any).status === status);

Deno.test("credentials: no row + global token -> global; connected -> own token; non-connected -> refused (never global)", async () => {
  Deno.env.set("META_ACCESS_TOKEN", "GLOBAL_TOKEN_VALUE");
  let row: Any = null;
  const mk = () => fakeClient(() => ({ data: row, error: null }), () => ({ data: "OWN_TOKEN_VALUE", error: null })).client;
  let c = await resolveWhatsappCredentials(mk(), "c1", "PHONE_CLINIC");
  check(c.ok && c.source === "global" && c.accessToken === "GLOBAL_TOKEN_VALUE" && c.phoneNumberId === "PHONE_CLINIC", "no row -> global token + clinics phone");
  row = { status: "connected", phone_number_id: "PHONE_OWN" };
  c = await resolveWhatsappCredentials(mk(), "c1", "PHONE_CLINIC");
  check(c.ok && c.source === "clinic" && c.accessToken === "OWN_TOKEN_VALUE" && c.phoneNumberId === "PHONE_OWN", "connected -> own token + own phone");
  for (const st of ["needs_reconnect", "disconnected", "error"]) {
    row = { status: st, phone_number_id: "PHONE_OWN" };
    c = await resolveWhatsappCredentials(mk(), "c1", "PHONE_CLINIC");
    check(!c.ok && c.status === st, st + " -> refused, global token NOT used");
  }
  row = { status: "connected", phone_number_id: "PHONE_OWN" };
  const noTok = fakeClient(() => ({ data: row, error: null }), () => ({ data: null, error: null })).client;
  c = await resolveWhatsappCredentials(noTok, "c1", "PHONE_CLINIC");
  check(!c.ok && c.reason === "token_unavailable", "connected but token missing -> refused");
  Deno.env.delete("META_ACCESS_TOKEN");
  row = null;
  c = await resolveWhatsappCredentials(mk(), "c1", "PHONE_CLINIC");
  check(!c.ok && c.reason === "no_global_token", "no row and no global token -> refused");
});

Deno.test("skip log is written once per 24h (dedupe), and 190 only flips a CLINIC-owned connection", async () => {
  let existing: Any[] = [];
  const f = fakeClient((op) => op.table === "activity_log" && op.ops.some(([n]) => n === "limit") ? { data: existing, error: null } : { data: { clinic_id: "c1" }, error: null });
  await logSendSkippedOnce(f.client, "c1", "connection_needs_reconnect", "needs_reconnect");
  check(f.log.some((o) => o.table === "activity_log" && o.ops.some(([n]) => n === "insert")), "first skip logged");
  existing = [{ id: "x" }];
  const f2 = fakeClient((op) => op.table === "activity_log" && op.ops.some(([n]) => n === "limit") ? { data: existing, error: null } : { data: null, error: null });
  await logSendSkippedOnce(f2.client, "c1", "connection_needs_reconnect", "needs_reconnect");
  check(!f2.log.some((o) => o.ops.some(([n]) => n === "insert")), "second skip within 24h not logged again");
  const g = fakeClient(() => ({ data: { clinic_id: "c1" }, error: null }));
  await noteGraphAuthFailure(g.client, "c1", "global", "190");
  check(g.log.length === 0, "190 on the GLOBAL token never touches clinic connections");
  await noteGraphAuthFailure(g.client, "c1", "clinic", "131026");
  check(g.log.length === 0, "non-190 error does nothing");
  await noteGraphAuthFailure(g.client, "c1", "clinic", "190");
  check(g.log.some((o) => o.table === "clinic_whatsapp_connections" && updatesStatus(o, "needs_reconnect")), "190 on a clinic's own token -> needs_reconnect");
});

Deno.test("connect-whatsapp scope check: token must grant the WABA the browser claimed", () => {
  const d = { granular_scopes: [{ scope: "whatsapp_business_management", target_ids: ["111", "222"] }, { scope: "business_management", target_ids: ["333"] }] };
  check(tokenCoversWaba(d, "222"), "WABA in scopes accepted");
  check(!tokenCoversWaba(d, "333"), "id only under a non-WhatsApp scope rejected");
  check(!tokenCoversWaba(d, "999"), "WABA not in scopes rejected");
  check(!tokenCoversWaba({}, "111"), "no granular scopes rejected");
  check(expiryToIso(0) === null && expiryToIso(undefined) === null, "expires_at 0 = never -> null");
  check(typeof expiryToIso(1900000000) === "string", "expiry converted");
  for (let i = 0; i < 200; i++) check(/^\d{6}$/.test(generatePin()), "PIN is 6 digits");
});

Deno.test("connect-whatsapp request validation", () => {
  const good = { code: "AQD_longenoughcode", waba_id: "123456789", phone_number_id: "987654321", business_id: "555555", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" };
  check(validateConnectWhatsAppRequest(good) === null, "valid");
  check(validateConnectWhatsAppRequest({ ...good, waba_id: "12 or 1=1" }) !== null, "non-numeric waba rejected");
  check(validateConnectWhatsAppRequest({ ...good, event: "HACK" }) !== null, "unknown event rejected");
  check(validateConnectWhatsAppRequest({ ...good, code: "" }) !== null, "empty code rejected");
  check(validateConnectWhatsAppRequest(null) !== null, "null body rejected");
});
