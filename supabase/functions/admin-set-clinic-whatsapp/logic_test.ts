// Run:  deno test --no-check supabase/functions/admin-set-clinic-whatsapp/logic_test.ts
import { checkPhoneNumberWithMeta, parseRequest } from "./logic.ts";

function check(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
}

const CLINIC = "11111111-2222-4333-8444-555555555555";

// ---------------------------------------------------------------------------------------------
// parseRequest
// ---------------------------------------------------------------------------------------------

Deno.test("attach: valid body", () => {
  const r = parseRequest({ clinic_id: CLINIC, waba_phone_number_id: " 1214524578415765 ", waba_business_id: "123456789", enable: true });
  check(r.ok && r.mode === "attach", "attach mode");
  if (r.ok && r.mode === "attach") {
    check(r.phoneNumberId === "1214524578415765", "trimmed");
    check(r.businessId === "123456789" && r.enable === true, "fields kept");
  }
});

Deno.test("attach: empty-string business id becomes null, empty-string phone id is 'required'", () => {
  const ok = parseRequest({ clinic_id: CLINIC, waba_phone_number_id: "1214524578415765", waba_business_id: "  ", enable: false });
  check(ok.ok && ok.mode === "attach" && ok.businessId === null, "blank business id -> null");
  const bad = parseRequest({ clinic_id: CLINIC, waba_phone_number_id: "", enable: false });
  check(!bad.ok && !!bad.fields.waba_phone_number_id, "blank phone id rejected, never stored as ''");
});

Deno.test("attach: non-digit ids, missing enable, bad clinic_id are rejected", () => {
  const a = parseRequest({ clinic_id: CLINIC, waba_phone_number_id: "12ab45678", enable: true });
  check(!a.ok && !!a.fields.waba_phone_number_id, "letters in phone id");
  const b = parseRequest({ clinic_id: CLINIC, waba_phone_number_id: "1214524578415765", waba_business_id: "12-34", enable: true });
  check(!b.ok && !!b.fields.waba_business_id, "dash in business id");
  const c = parseRequest({ clinic_id: CLINIC, waba_phone_number_id: "1214524578415765" });
  check(!c.ok && !!c.fields.enable, "enable required");
  const d = parseRequest({ clinic_id: CLINIC, waba_phone_number_id: "1214524578415765", enable: "yes" });
  check(!d.ok && !!d.fields.enable, "enable must be a boolean");
  const e = parseRequest({ clinic_id: "not-a-uuid", waba_phone_number_id: "1214524578415765", enable: true });
  check(!e.ok && !!e.fields.clinic_id, "clinic_id must be a uuid");
  const f = parseRequest({ waba_phone_number_id: "1214524578415765", enable: true });
  check(!f.ok && !!f.fields.clinic_id, "clinic_id required");
  const g = parseRequest({ clinic_id: CLINIC, waba_phone_number_id: "9".repeat(40), enable: true });
  check(!g.ok, "absurdly long id rejected");
});

Deno.test("verify_only needs only a phone id; clinic_id is not required", () => {
  const r = parseRequest({ verify_only: true, waba_phone_number_id: "1214524578415765" });
  check(r.ok && r.mode === "verify_only", "verify_only mode");
  const bad = parseRequest({ verify_only: true });
  check(!bad.ok && !!bad.fields.waba_phone_number_id, "phone id required");
});

Deno.test("detach needs only clinic_id; verify_only + detach together is rejected", () => {
  const r = parseRequest({ detach: true, clinic_id: CLINIC });
  check(r.ok && r.mode === "detach", "detach mode");
  const bad = parseRequest({ detach: true });
  check(!bad.ok && !!bad.fields.clinic_id, "clinic_id required");
  const both = parseRequest({ detach: true, verify_only: true, clinic_id: CLINIC, waba_phone_number_id: "1214524578415765" });
  check(!both.ok, "mutually exclusive");
});

Deno.test("body role / user fields are ignored (identity only ever comes from the JWT)", () => {
  const r = parseRequest({ clinic_id: CLINIC, waba_phone_number_id: "1214524578415765", enable: true, role: "super_admin", user_id: "x" });
  check(r.ok && r.mode === "attach", "extra keys have no effect");
  check(!("role" in r) && !("user_id" in r), "not carried into the parsed request");
});

Deno.test("non-object body does not throw", () => {
  check(!parseRequest(null).ok && !parseRequest("x").ok && !parseRequest(42).ok, "rejected cleanly");
});

// ---------------------------------------------------------------------------------------------
// checkPhoneNumberWithMeta
// ---------------------------------------------------------------------------------------------

const fakeFetch = (status: number, body: unknown) =>
  (() => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))) as unknown as typeof fetch;

Deno.test("Meta success returns the display number and verified name", async () => {
  const r = await checkPhoneNumberWithMeta(
    "1214524578415765",
    "TOKEN",
    fakeFetch(200, { id: "1214524578415765", display_phone_number: "+91 99999 99999", verified_name: "SmartDentist", quality_rating: "GREEN", code_verification_status: "VERIFIED" }),
  );
  check(r.ok, "ok");
  if (r.ok) check(r.info.display_phone_number === "+91 99999 99999" && r.info.verified_name === "SmartDentist" && r.info.quality_rating === "GREEN", "fields passed through");
});

Deno.test("Meta 'does not exist' (code 100) -> 422, nothing to save", async () => {
  const r = await checkPhoneNumberWithMeta("123456789012345", "TOKEN", fakeFetch(400, { error: { code: 100, message: "Unsupported get request" } }));
  check(!r.ok && r.status === 422 && r.metaErrorCode === 100, "422 with code 100");
});

Deno.test("Meta bad platform token (code 190) -> 502, not blamed on the number", async () => {
  const r = await checkPhoneNumberWithMeta("123456789012345", "TOKEN", fakeFetch(401, { error: { code: 190, message: "Invalid OAuth access token" } }));
  check(!r.ok && r.status === 502 && r.metaErrorCode === 190, "502 for a bad platform token");
});

Deno.test("network failure -> 502", async () => {
  const boom = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
  const r = await checkPhoneNumberWithMeta("123456789012345", "TOKEN", boom);
  check(!r.ok && r.status === 502, "502 on network failure");
});

Deno.test("Meta answering for a different id is not trusted", async () => {
  const r = await checkPhoneNumberWithMeta("1214524578415765", "TOKEN", fakeFetch(200, { id: "999999999999999", display_phone_number: "x" }));
  check(!r.ok, "id mismatch rejected");
});

Deno.test("the token goes in a header only: never in the URL, never in the result", async () => {
  let seenUrl = "";
  let seenAuth = "";
  const spy = ((url: string, init: RequestInit) => {
    seenUrl = url;
    seenAuth = String((init.headers as Record<string, string>).Authorization);
    return Promise.resolve(new Response(JSON.stringify({ error: { code: 100 } }), { status: 400 }));
  }) as unknown as typeof fetch;
  const r = await checkPhoneNumberWithMeta("123456789012345", "SECRET_TOKEN_VALUE", spy);
  check(!seenUrl.includes("SECRET_TOKEN_VALUE"), "token not in URL");
  check(seenAuth === "Bearer SECRET_TOKEN_VALUE", "token sent as Bearer header");
  check(!JSON.stringify(r).includes("SECRET_TOKEN_VALUE"), "token not in result");
  check(seenUrl.includes("fields=display_phone_number,verified_name,quality_rating,code_verification_status"), "asks for the four fields");
});
