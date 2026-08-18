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
