// WhatsApp Embedded Signup (Facebook Login for Business) -- browser side.
//
// This file has silent failure modes (a wrong origin check or a wrong id simply "does nothing"), so
// the rules below are deliberate:
//  * The Facebook SDK is loaded and FB.init'ed AHEAD of time (preloadFacebookSdk, run when the
//    WhatsApp tab mounts). startWhatsAppSignup() never waits for the SDK: browsers only allow a
//    popup inside the click's own user gesture, so FB.login must run synchronously in the click.
//    If the SDK is not ready yet it fails immediately instead of waiting.
//  * The result is a plain discriminated object, never a throw/reject: callers branch on `.ok`.
//  * The FB.login callback is a plain NON-async function (the SDK refuses an async one).
//  * The `message` listener accepts ONLY events whose origin is exactly facebook.com or a
//    *.facebook.com subdomain over https. Meta's own sample uses origin.endsWith("facebook.com"),
//    which would also accept "evilfacebook.com".
//  * Everything this returns is untrusted by the server: connect-whatsapp re-verifies every id
//    against Meta before storing anything. Never log the code.

import { useEffect, useSyncExternalStore } from "react";

const APP_ID = import.meta.env.VITE_META_APP_ID as string | undefined;
const CONFIG_ID = import.meta.env.VITE_WA_ES_CONFIG_ID as string | undefined;

const GRAPH_API_VERSION = "v26.0";
const SDK_URL = "https://connect.facebook.net/en_US/sdk.js";
const SDK_SCRIPT_ID = "facebook-jssdk";
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

// ---------------------------------------------------------------------------------------------
// SDK preload
// ---------------------------------------------------------------------------------------------

export type FacebookSdkStatus = "idle" | "loading" | "ready" | "failed";

let sdkStatus: FacebookSdkStatus = "idle";
let sdkPromise: Promise<void> | null = null;
const sdkListeners = new Set<() => void>();

function setSdkStatus(next: FacebookSdkStatus) {
  if (sdkStatus === next) return;
  sdkStatus = next;
  sdkListeners.forEach((listener) => listener());
}

export function getFacebookSdkStatus(): FacebookSdkStatus {
  return sdkStatus;
}

export function subscribeFacebookSdkStatus(listener: () => void): () => void {
  sdkListeners.add(listener);
  return () => {
    sdkListeners.delete(listener);
  };
}

/**
 * Loads the Facebook SDK and runs FB.init. Safe to call any number of times: a load already in
 * progress or finished is reused, a failed one is retried. Resolves once FB is ready to use;
 * rejects (and sets the status to "failed") if it could not load.
 */
export function preloadFacebookSdk(): Promise<void> {
  if (sdkStatus === "ready") return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  const appId = APP_ID;
  setSdkStatus("loading");
  sdkPromise = new Promise<void>((resolve, reject) => {
    if (!appId) {
      reject(new Error("VITE_META_APP_ID is not set"));
      return;
    }

    const initAndResolve = () => {
      if (!window.FB) {
        reject(new Error("Facebook SDK loaded without FB"));
        return;
      }
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_API_VERSION });
      resolve();
    };

    // The script ran before (e.g. an earlier attempt timed out after it had loaded): just init.
    if (window.FB) {
      initAndResolve();
      return;
    }

    const timer = window.setTimeout(() => reject(new Error("Facebook SDK did not load in time")), SDK_LOAD_TIMEOUT_MS);
    window.fbAsyncInit = () => {
      window.clearTimeout(timer);
      initAndResolve();
    };

    // Drop a script tag left by a failed earlier attempt so the retry really re-requests it.
    document.getElementById(SDK_SCRIPT_ID)?.remove();
    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.src = SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Could not load the Facebook SDK (blocked by the network or an ad-blocker?)"));
    };
    document.head.appendChild(script);
  }).then(
    () => {
      setSdkStatus("ready");
    },
    (err: unknown) => {
      // Not cached: the next preload call starts a fresh attempt.
      sdkPromise = null;
      setSdkStatus("failed");
      throw err;
    },
  );
  return sdkPromise;
}

/**
 * React hook for the WhatsApp tab: starts the preload on mount and reports its status so the
 * Connect button can stay disabled ("Meta ready ho raha hai...") until it is "ready". "idle" is
 * reported as "loading" because the preload starts on this very render's effect.
 */
export function useFacebookSdkStatus(): Exclude<FacebookSdkStatus, "idle"> {
  const status = useSyncExternalStore(subscribeFacebookSdkStatus, getFacebookSdkStatus, getFacebookSdkStatus);
  useEffect(() => {
    if (getFacebookSdkStatus() !== "ready") {
      preloadFacebookSdk().catch(() => {
        // The failure is reported through the status; nothing else to do here.
      });
    }
  }, []);
  return status === "idle" ? "loading" : status;
}

// ---------------------------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------------------------

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

function immediateFailure(message: string): Promise<WhatsAppSignupResult> {
  return Promise.resolve({ ok: false, error: "failed", message });
}

/**
 * Opens the Embedded Signup popup and resolves once BOTH halves have arrived: the login `code`
 * (FB.login callback) and the session info with the new waba_id / phone_number_id (`message` event).
 *
 * Call it directly from the click handler, with nothing awaited before it. It does no waiting of its
 * own before FB.login: if the SDK is not ready (see preloadFacebookSdk / useFacebookSdkStatus) it
 * returns a failure right away rather than loading it now, which would lose the click's user gesture.
 *
 * featureType 'whatsapp_business_app_onboarding' + sessionInfoVersion '3' are ALWAYS sent
 * explicitly (not left to the Embedded Signup version default), so a clinic can keep using the
 * WhatsApp Business app on the same number (coexistence) or register a fresh number.
 */
export function startWhatsAppSignup(): Promise<WhatsAppSignupResult> {
  const configId = CONFIG_ID;
  if (!APP_ID || !configId) {
    return immediateFailure("WhatsApp signup is not configured (VITE_META_APP_ID / VITE_WA_ES_CONFIG_ID missing).");
  }
  if (inFlight) {
    return immediateFailure("A WhatsApp signup is already in progress.");
  }
  const fb = window.FB;
  if (sdkStatus !== "ready" || !fb) {
    // Not ready: do not wait. Kick off a (re)load in the background so a later click can work.
    preloadFacebookSdk().catch(() => {});
    return immediateFailure("The Facebook SDK is not ready yet. Please wait a moment and try again.");
  }
  inFlight = true;

  // The Promise executor runs synchronously, so FB.login below is called in the same tick as the click.
  return new Promise<WhatsAppSignupResult>((resolve) => {
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
  });
}
