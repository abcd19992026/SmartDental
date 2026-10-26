// WhatsApp Embedded Signup (Facebook Login for Business) -- browser side.
//
// This file has silent failure modes (a wrong origin check or a wrong id simply "does nothing"), so
// the rules below are deliberate:
//  * The result is a plain discriminated object, never a throw/reject: callers branch on `.ok`.
//  * The FB.login callback is a plain NON-async function (the SDK refuses an async one).
//  * The `message` listener accepts ONLY events whose origin is exactly facebook.com or a
//    *.facebook.com subdomain over https. Meta's own sample uses origin.endsWith("facebook.com"),
//    which would also accept "evilfacebook.com".
//  * Everything this returns is untrusted by the server: connect-whatsapp re-verifies every id
//    against Meta before storing anything. Never log the code.

const APP_ID = import.meta.env.VITE_META_APP_ID as string | undefined;
const CONFIG_ID = import.meta.env.VITE_WA_ES_CONFIG_ID as string | undefined;

const GRAPH_API_VERSION = "v26.0";
const SDK_URL = "https://connect.facebook.net/en_US/sdk.js";
const SDK_LOAD_TIMEOUT_MS = 15_000;
/** Whole popup flow: a person may take a while to log in and pick a number. */
const SIGNUP_TIMEOUT_MS = 10 * 60 * 1000;
/** The FB.login code lives 30 s on Meta's side, so once one side (code or session info) has arrived
 * the other must follow quickly, or the code is useless anyway. */
const SECOND_HALF_TIMEOUT_MS = 20_000;

export type WhatsAppSignupErrorKind = "cancelled" | "failed" | "timeout";

export interface WhatsAppSignupData {
  /** One-time code (30 s). Send straight to connect-whatsapp. */
  code: string;
  waba_id: string;
  phone_number_id: string;
  business_id?: string;
  /** Finish event Meta reported, e.g. FINISH or FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING. A hint only. */
  event: string;
}

export type WhatsAppSignupResult =
  | { ok: true; data: WhatsAppSignupData }
  | { ok: false; error: WhatsAppSignupErrorKind; message: string };

interface FacebookLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}

interface FacebookSdk {
  init(params: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

/** Exactly facebook.com or a subdomain of it, over https. */
export function isFacebookOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com"));
  } catch {
    return false;
  }
}

let sdkPromise: Promise<FacebookSdk> | null = null;

function loadFacebookSdk(): Promise<FacebookSdk> {
  if (sdkPromise) return sdkPromise;
  const appId = APP_ID;
  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    if (!appId) {
      reject(new Error("VITE_META_APP_ID is not set"));
      return;
    }
    const timer = window.setTimeout(() => reject(new Error("Facebook SDK did not load in time")), SDK_LOAD_TIMEOUT_MS);
    window.fbAsyncInit = () => {
      if (!window.FB) {
        window.clearTimeout(timer);
        reject(new Error("Facebook SDK loaded without FB"));
        return;
      }
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_API_VERSION });
      window.clearTimeout(timer);
      resolve(window.FB);
    };
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Could not load the Facebook SDK (blocked by the network or an ad-blocker?)"));
    };
    document.head.appendChild(script);
  }).catch((err) => {
    // Allow a later retry instead of caching the failure forever.
    sdkPromise = null;
    throw err;
  });
  return sdkPromise;
}

interface SessionInfo {
  waba_id: string;
  phone_number_id: string;
  business_id?: string;
  event: string;
}

const NUMERIC_ID = /^\d{5,32}$/;

/** Meta posts the payload either as an object or as a JSON string. */
function parseMessageData(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

let inFlight = false;

/**
 * Opens the Embedded Signup popup and resolves once BOTH halves have arrived: the login `code`
 * (FB.login callback) and the session info with the new waba_id / phone_number_id (`message` event).
 *
 * featureType 'whatsapp_business_app_onboarding' + sessionInfoVersion '3' are ALWAYS sent
 * explicitly (not left to the Embedded Signup version default), so a clinic can keep using the
 * WhatsApp Business app on the same number (coexistence) or register a fresh number.
 */
export function startWhatsAppSignup(): Promise<WhatsAppSignupResult> {
  const configId = CONFIG_ID;
  if (!APP_ID || !configId) {
    return Promise.resolve({
      ok: false,
      error: "failed",
      message: "WhatsApp signup is not configured (VITE_META_APP_ID / VITE_WA_ES_CONFIG_ID missing).",
    });
  }
  if (inFlight) {
    return Promise.resolve({ ok: false, error: "failed", message: "A WhatsApp signup is already in progress." });
  }
  inFlight = true;

  return loadFacebookSdk().then(
    (fb) =>
      new Promise<WhatsAppSignupResult>((resolve) => {
        let code: string | null = null;
        let session: SessionInfo | null = null;
        let settled = false;
        let overallTimer = 0;
        let secondHalfTimer = 0;

        const finish = (result: WhatsAppSignupResult) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(overallTimer);
          window.clearTimeout(secondHalfTimer);
          window.removeEventListener("message", onMessage);
          inFlight = false;
          resolve(result);
        };

        const tryComplete = () => {
          if (code && session) {
            finish({
              ok: true,
              data: {
                code,
                waba_id: session.waba_id,
                phone_number_id: session.phone_number_id,
                ...(session.business_id ? { business_id: session.business_id } : {}),
                event: session.event,
              },
            });
            return;
          }
          // One half is in: the other must follow fast.
          if ((code || session) && !secondHalfTimer) {
            secondHalfTimer = window.setTimeout(
              () => finish({ ok: false, error: "timeout", message: "WhatsApp signup did not finish in time. Please try again." }),
              SECOND_HALF_TIMEOUT_MS,
            );
          }
        };

        function onMessage(event: MessageEvent) {
          if (!isFacebookOrigin(event.origin)) return;
          const data = parseMessageData(event.data);
          if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;

          const kind = typeof data.event === "string" ? data.event : "";
          const payload = (data.data && typeof data.data === "object" ? data.data : {}) as Record<string, unknown>;

          if (kind === "CANCEL") {
            finish({ ok: false, error: "cancelled", message: "WhatsApp signup was cancelled." });
            return;
          }
          if (kind === "ERROR") {
            finish({ ok: false, error: "failed", message: "WhatsApp reported an error during signup." });
            return;
          }
          if (kind.startsWith("FINISH")) {
            const wabaId = payload.waba_id;
            const phoneNumberId = payload.phone_number_id;
            const businessId = payload.business_id;
            if (typeof wabaId !== "string" || !NUMERIC_ID.test(wabaId) || typeof phoneNumberId !== "string" || !NUMERIC_ID.test(phoneNumberId)) {
              // e.g. FINISH_ONLY_WABA: an account was created but no phone number was added.
              finish({
                ok: false,
                error: "failed",
                message: "Signup finished without a WhatsApp phone number. Please add a number and try again.",
              });
              return;
            }
            session = {
              waba_id: wabaId,
              phone_number_id: phoneNumberId,
              ...(typeof businessId === "string" && NUMERIC_ID.test(businessId) ? { business_id: businessId } : {}),
              event: kind,
            };
            tryComplete();
          }
        }

        window.addEventListener("message", onMessage);
        overallTimer = window.setTimeout(
          () => finish({ ok: false, error: "timeout", message: "WhatsApp signup took too long. Please try again." }),
          SIGNUP_TIMEOUT_MS,
        );

        // Plain (non-async) callback -- FB.login throws on an async one.
        function loginCallback(response: FacebookLoginResponse) {
          const receivedCode = response.authResponse?.code;
          if (receivedCode) {
            code = receivedCode;
            tryComplete();
            return;
          }
          // No code: the person closed the popup / declined. If the popup already reported a
          // CANCEL/ERROR message it has settled by now; otherwise treat it as a cancel.
          finish({ ok: false, error: "cancelled", message: "WhatsApp signup was cancelled." });
        }

        try {
          fb.login(loginCallback, {
            config_id: configId,
            response_type: "code",
            override_default_response_type: true,
            extras: {
              setup: {},
              featureType: "whatsapp_business_app_onboarding",
              sessionInfoVersion: "3",
            },
          });
        } catch {
          finish({ ok: false, error: "failed", message: "Could not open the WhatsApp signup window." });
        }
      }),
    (err: unknown) => {
      inFlight = false;
      return {
        ok: false,
        error: "failed",
        message: err instanceof Error ? err.message : "Could not load the Facebook SDK.",
      } as WhatsAppSignupResult;
    },
  );
}
