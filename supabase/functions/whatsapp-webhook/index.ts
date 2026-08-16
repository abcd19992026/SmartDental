import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/response.ts";
import { timingSafeEqual } from "../_shared/timing-safe-equal.ts";
import { processWebhookPayload } from "./handlers.ts";

async function verifyMetaSignature(body: ArrayBuffer, signatureHeader: string, appSecret: string): Promise<boolean> {
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const providedHex = signatureHeader.slice(prefix.length);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  // Signed over the raw request bytes, not a re-serialized JSON object -- re-serializing (even
  // with identical field values) can reorder keys or change whitespace, which changes the bytes
  // and makes the signature never match.
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, body);
  const computedHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(computedHex, providedHex);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    // Meta's one-time subscription handshake. The challenge must only ever be echoed back after
    // verify_token is checked -- returning it unconditionally leaves the endpoint open to anyone
    // claiming this webhook URL as their own.
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const verifyToken = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN");

    if (mode === "subscribe" && verifyToken && token && timingSafeEqual(token, verifyToken)) {
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return json({ error: "Verification failed" }, 403);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const bodyBuffer = await req.arrayBuffer();
  const signatureHeader = req.headers.get("X-Hub-Signature-256");
  const appSecret = Deno.env.get("META_APP_SECRET");

  const validSignature =
    !!appSecret && !!signatureHeader && (await verifyMetaSignature(bodyBuffer, signatureHeader, appSecret));
  if (!validSignature) {
    return json({ error: "Invalid signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBuffer));
  } catch {
    // Signature was valid but the body wasn't JSON -- nothing to process. Still 200: a non-200
    // here makes Meta retry aggressively, which won't fix a malformed body.
    return json({ received: true }, 200);
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Always return 200 quickly, then process -- Meta retries aggressively on any non-200 (and on
  // slow responses), which would produce duplicate processing if the handler blocked the
  // response on it. EdgeRuntime.waitUntil keeps the isolate alive to finish the work after the
  // response is sent; it's absent under `supabase functions serve` locally, so fall back to
  // awaiting inline there.
  const processing = processWebhookPayload(serviceClient, payload as Parameters<typeof processWebhookPayload>[1]).catch(
    (err) => {
      console.error("Webhook processing error", err);
    },
  );

  // Read via globalThis rather than a `declare const EdgeRuntime` -- the Supabase Edge Runtime
  // already provides its own ambient type for this global, and redeclaring it risks a duplicate-
  // identifier type error in that environment even though this file never fails at runtime.
  const edgeRuntime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(processing);
  } else {
    await processing;
  }

  return json({ received: true }, 200);
});
