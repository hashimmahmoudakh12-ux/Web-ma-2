/**
 * Time helpers.
 *
 * Every café lives in its own time zone. A "week" or a "day" must be measured
 * on the café's clock, not the server's (Vercel servers run on UTC).
 *
 * We represent calendar days as plain strings like "2026-11-06" ("local dates").
 * Doing math on those strings (via UTC midnight) avoids daylight-saving bugs.
 */

/** "2026-11-06" style calendar date in the given IANA time zone. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(date: string): number {
  return toUtc(date).getUTCDay();
}

/**
 * First day of the week containing `date`.
 * weekStartsOn: 0 = Sunday, 1 = Monday (default).
 */
export function weekStart(date: string, weekStartsOn = 1): string {
  const offset = (dayOfWeek(date) - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

/** Last day of the week containing `date`. */
export function weekEnd(date: string, weekStartsOn = 1): string {
  return addDays(weekStart(date, weekStartsOn), 6);
}

/** "2026-11" — used for monthly things (streak savers, leaderboard). */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** "Sunday, Nov 15" */
export function formatDay(date: string): string {
  return toUtc(date).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/** "5:14 PM" on the café's clock. */
export function formatTime(instant: Date, timeZone: string): string {
  return instant.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The real instant for "this local date at hour:minute" in a time zone. */
export function zonedInstant(date: string, hour: number, minute: number, timeZone: string): Date {
  const guess = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

/** First and last day of the month containing `date`. */
export function monthRange(date: string): { from: string; to: string } {
  const from = `${date.slice(0, 7)}-01`;
  const [y, m] = from.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${date.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

/** "2026-11" -> "2026-10" */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** "2026-11" -> "November 2026" */
export function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
}

/** "Nov 6" */
export function formatShortDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

/** Hour of the day (0-23) on the café's clock. */
export function localHour(instant: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(instant);
  return Number(h) % 24;
}
