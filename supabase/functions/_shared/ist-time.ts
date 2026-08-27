const IST_TIME_ZONE = "Asia/Kolkata";

export interface IstNow {
  /** 0-23, IST wall clock hour. */
  hour: number;
  /** IST calendar date as YYYY-MM-DD, for comparison against `date` columns
   * (due_date, plan_expires_on, next_retry_date) and for building today's `last_attempt_at`
   * idempotency window. */
  dateStr: string;
}

const IST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  // "h23" rather than the default/`hour12: false` -- the latter has a well-known ICU quirk where
  // midnight renders as "24" instead of "00" in some locales/environments, which would silently
  // break the send-window and per-clinic send_time hour comparisons around midnight IST.
  hourCycle: "h23",
});

function formatIst(instant: Date): IstNow {
  const map = Object.fromEntries(IST_FORMATTER.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    hour: parseInt(map.hour, 10),
    dateStr: `${map.year}-${map.month}-${map.day}`,
  };
}

/** Reads the current instant through the Asia/Kolkata timezone. */
export function getIstNow(): IstNow {
  return formatIst(new Date());
}

/** IST calendar date (YYYY-MM-DD) of an arbitrary instant -- e.g. a stored `last_attempt_at`
 * timestamptz. Deliberately not a naive `.toISOString().slice(0, 10)`: that reads the UTC date,
 * which only coincides with the IST date outside a ~5.5-hour window each day (UTC 18:30-23:59,
 * when IST has already rolled into the next calendar day). Idempotency checks that compare a
 * stored timestamp's date against today's IST date must use this, not the UTC shortcut. */
export function istDateOf(instant: Date): string {
  return formatIst(instant).dateStr;
}

/** Adds `days` (may be negative) to a YYYY-MM-DD date string and returns the result in the same
 * format. Pure calendar-date arithmetic -- deliberately not timezone-aware, since `date` columns
 * have no time component to begin with. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Formats a YYYY-MM-DD date as "13 Aug 2026" for display inside outbound WhatsApp template
 * bodies -- mirrors src/lib/dates.ts's formatDateIST() exactly (same locale, same options) so a
 * date reads identically whether it's rendered in the app UI or in a message a patient receives.
 * Never pass a raw `date` column value straight into a template parameter -- a patient should
 * never see "2026-08-13". */
export function formatDateIST(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+05:30`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: IST_TIME_ZONE,
  });
}

/** Combines an IST calendar date (YYYY-MM-DD) and an IST wall-clock time (`HH:MM` or `HH:MM:SS`,
 * as Postgres's `time` type round-trips through supabase-js) into a real instant, via an explicit
 * +05:30 offset -- never relies on the server's own local timezone. `timeStr` is padded/defaulted
 * so a bare "HH:MM" (no seconds) still parses. Used by the recall reminder ladder (21A-2) to
 * compare a recall's due_date/due_time against `now()` as real instants, not string/date-only
 * comparisons -- necessary once a stage's target is a specific time of day, not just a day. */
export function combineIstInstant(dateStr: string, timeStr: string): Date {
  const [hh = "00", mm = "00", ss = "00"] = timeStr.split(":");
  return new Date(`${dateStr}T${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:${ss.padStart(2, "0")}+05:30`);
}

/** Formats an IST wall-clock time ("HH:MM" or "HH:MM:SS") as 12-hour with AM/PM, e.g. "14:30" ->
 * "2:30 PM" -- for display inside outbound WhatsApp template bodies (21A-2's stage 1/2 due-date
 * parameter). due_time has no timezone component of its own (it's already IST wall-clock, same as
 * every other time concept in this codebase), so this is pure string/arithmetic formatting, no
 * Date/timezone conversion needed. */
export function formatTimeIST12h(timeStr: string): string {
  const [hStr, mStr = "00"] = timeStr.split(":");
  const h24 = parseInt(hStr, 10);
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mStr.padStart(2, "0")} ${period}`;
}
