import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeConsultation, type TranscribeConsultationOutput } from "@/lib/clinic-api";
import type { DictationErrorCode } from "@/features/clinic/dictation/dictationErrors";

export type DictationRecorderState = "idle" | "requesting" | "recording" | "processing" | "error";

export interface UseDictationRecorderOptions {
  maxSeconds: number;
  /** Optional hints forwarded to the model, never stored anywhere -- see transcribe-consultation
   * §3.4. Read fresh on every start() via a ref so a caller doesn't need to worry about stale
   * closures if the patient context changes between dictations. */
  patientAge?: number;
  patientSex?: string;
  onResult: (result: TranscribeConsultationOutput) => void;
  onError: (code: DictationErrorCode, message: string) => void;
}

export interface UseDictationRecorderResult {
  state: DictationRecorderState;
  /** Recorded (unpaused) seconds -- what actually gets billed and sent as duration_seconds. */
  seconds: number;
  /** 0..1 input level, throttled to ~10 updates/sec. Not driven by every animation frame. */
  level: number;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

// Hysteresis: a lower resume threshold than pause threshold means the moment speech resumes --
// even faintly, below the stricter pause bar -- recording unpauses immediately, protecting the
// first syllable of the next word. The higher pause threshold means genuinely quiet moments
// (not just soft speech) are what trigger the 1.5s pause countdown. Tuned against synthesized
// speech during this phase's verification, not a real noisy clinic floor -- see the phase report
// for why these two numbers may need real-world adjustment.
const PAUSE_RMS_THRESHOLD = 0.02;
const RESUME_RMS_THRESHOLD = 0.01;
const PAUSE_HOLD_MS = 1500;
const SILENCE_POLL_MS = 50;
const LEVEL_UPDATE_MS = 100;
const SECONDS_TICK_MS = 250;

const MIME_PREFERENCE = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/mpeg", "audio/wav"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return MIME_PREFERENCE.find((t) => MediaRecorder.isTypeSupported(t));
}

function classifyGetUserMediaError(err: unknown): DictationErrorCode {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "MIC_PERMISSION_DENIED";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "NO_MICROPHONE";
  return "UNKNOWN";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Records the doctor's voice, uploads it to transcribe-consultation, and reports the result --
 * see the phase spec for the full behavioural contract (silence-skip, wake lock, cleanup). One
 * hook instance owns one recording session end-to-end; call start() again for the next dictation. */
export function useDictationRecorder(options: UseDictationRecorderOptions): UseDictationRecorderResult {
  const [state, setState] = useState<DictationRecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const rafRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  // Recorded-time accounting: accumulatedMs covers every segment already paused/stopped;
  // segmentStartedAt is when the CURRENT (unpaused) segment began. seconds state is a throttled
  // read of accumulatedMs + (now - segmentStartedAt) while actively recording.
  const accumulatedMsRef = useRef(0);
  const segmentStartedAtRef = useRef(0);
  const isPausedRef = useRef(false);
  const belowPauseThresholdSinceRef = useRef<number | null>(null);
  const lastLevelUpdateRef = useRef(0);
  const lastSilencePollRef = useRef(0);
  const lastSecondsTickRef = useRef(0);

  const currentSeconds = useCallback(() => {
    const active = isPausedRef.current ? 0 : performance.now() - segmentStartedAtRef.current;
    return Math.floor((accumulatedMsRef.current + active) / 1000);
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  const requestWakeLock = useCallback(() => {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock
      .request("screen")
      .then((sentinel) => {
        wakeLockRef.current = sentinel;
      })
      .catch(() => {
        // Unsupported in this context (or a permissions-policy block) -- never fatal to recording.
      });
  }, []);

  /** Stops every track, closes the audio graph, releases the wake lock, cancels the poll loop.
   * Idempotent -- safe to call from stop(), cancel(), an error path, and unmount alike. */
  const cleanup = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
    releaseWakeLock();
  }, [releaseWakeLock]);

  const pollLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const recorder = recorderRef.current;
    if (!analyser || !recorder) return;

    const now = performance.now();

    if (now - lastSilencePollRef.current >= SILENCE_POLL_MS) {
      lastSilencePollRef.current = now;

      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const normalized = (data[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);

      if (now - lastLevelUpdateRef.current >= LEVEL_UPDATE_MS) {
        lastLevelUpdateRef.current = now;
        setLevel(Math.min(1, rms / 0.5));
      }

      if (!isPausedRef.current) {
        if (rms < PAUSE_RMS_THRESHOLD) {
          if (belowPauseThresholdSinceRef.current === null) belowPauseThresholdSinceRef.current = now;
          else if (now - belowPauseThresholdSinceRef.current >= PAUSE_HOLD_MS && recorder.state === "recording") {
            accumulatedMsRef.current += now - segmentStartedAtRef.current;
            isPausedRef.current = true;
            belowPauseThresholdSinceRef.current = null;
            recorder.pause();
          }
        } else {
          belowPauseThresholdSinceRef.current = null;
        }
      } else if (rms >= RESUME_RMS_THRESHOLD) {
        isPausedRef.current = false;
        segmentStartedAtRef.current = now;
        belowPauseThresholdSinceRef.current = null;
        if (recorder.state === "paused") recorder.resume();
      }
    }

    if (now - lastSecondsTickRef.current >= SECONDS_TICK_MS) {
      lastSecondsTickRef.current = now;
      const secs = currentSeconds();
      setSeconds(secs);
      if (secs >= optionsRef.current.maxSeconds) {
        // Hard cap: send whatever was captured, never discard it for running out the clock.
        stopRef.current();
        return;
      }
    }

    rafRef.current = requestAnimationFrame(pollLoop);
  }, [currentSeconds]);

  const finishAndUpload = useCallback(async () => {
    const chunks = chunksRef.current;
    const mimeType = mimeTypeRef.current;
    cleanup();

    if (cancelledRef.current) {
      setState("idle");
      setSeconds(0);
      setLevel(0);
      return;
    }

    setState("processing");
    const blob = new Blob(chunks, { type: mimeType });
    const durationSeconds = currentSeconds();

    try {
      const audioBase64 = await blobToBase64(blob);
      const result = await transcribeConsultation({
        audioBase64,
        mimeType,
        durationSeconds: Math.max(1, durationSeconds),
        patientAge: optionsRef.current.patientAge,
        patientSex: optionsRef.current.patientSex,
      });

      if (result.ok) {
        setState("idle");
        setSeconds(0);
        setLevel(0);
        optionsRef.current.onResult(result.data);
      } else {
        const code = (result.code as DictationErrorCode | undefined) ?? (navigator.onLine ? "NETWORK_ERROR" : "OFFLINE");
        setState("error");
        optionsRef.current.onError(code, result.error);
      }
    } catch {
      setState("error");
      optionsRef.current.onError(navigator.onLine ? "NETWORK_ERROR" : "OFFLINE", "Upload failed");
    }
  }, [cleanup, currentSeconds]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || (state !== "recording" && state !== "requesting")) return;
    if (recorder.state === "inactive") return;
    recorder.stop();
  }, [state]);

  // stopRef lets the poll loop (a stable useCallback) call the latest stop() without pulling
  // `state` into its own dependency array and re-creating the rAF chain every render.
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      cleanup();
      setState("idle");
      setSeconds(0);
      setLevel(0);
    }
  }, [cleanup]);

  const start = useCallback(() => {
    if (state === "requesting" || state === "recording" || state === "processing") return;

    cancelledRef.current = false;
    setState("requesting");
    setSeconds(0);
    setLevel(0);

    if (!window.isSecureContext) {
      setState("error");
      optionsRef.current.onError("INSECURE_ORIGIN", "Microphone requires HTTPS");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      optionsRef.current.onError("UNKNOWN", "Microphone is not supported in this browser");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((stream) => {
        if (cancelledRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const mimeType = pickMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        mimeTypeRef.current = recorder.mimeType || mimeType || "audio/webm";
        recorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          void finishAndUpload();
        };

        const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioContextCtor();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        audioCtxRef.current = audioCtx;
        analyserRef.current = analyser;

        accumulatedMsRef.current = 0;
        segmentStartedAtRef.current = performance.now();
        isPausedRef.current = false;
        belowPauseThresholdSinceRef.current = null;
        lastLevelUpdateRef.current = 0;
        lastSilencePollRef.current = 0;
        lastSecondsTickRef.current = 0;

        recorder.start();
        setState("recording");
        requestWakeLock();
        rafRef.current = requestAnimationFrame(pollLoop);
      })
      .catch((err: unknown) => {
        setState("error");
        optionsRef.current.onError(classifyGetUserMediaError(err), "Could not access the microphone");
      });
  }, [state, finishAndUpload, pollLoop, requestWakeLock]);

  // Re-acquire the wake lock when the tab becomes visible again mid-recording -- it is dropped
  // automatically by the browser whenever the tab is hidden.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible" && recorderRef.current && recorderRef.current.state !== "inactive") {
        requestWakeLock();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [requestWakeLock]);

  // Unmount mid-recording: never leave the mic indicator on.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on unmount
  }, []);

  return { state, seconds, level, start, stop, cancel };
}
