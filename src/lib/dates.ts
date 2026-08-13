// Asia/Kolkata date helpers, used throughout the app (access gate now; recall due-dates and
// the daily send job in later phases) so "today" means the same thing regardless of the
// browser's local timezone.

/** Today's date in Asia/Kolkata, as YYYY-MM-DD -- directly comparable against `date` columns. */
export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Days from today (IST) until the given YYYY-MM-DD date. Negative if the date is in the past. */
export function daysUntilIST(dateStr: string): number {
  const today = new Date(`${todayIST()}T00:00:00+05:30`);
  const target = new Date(`${dateStr}T00:00:00+05:30`);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

/** Formats a YYYY-MM-DD date as "13 Aug 2026" for display. */
export function formatDateIST(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+05:30`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}
