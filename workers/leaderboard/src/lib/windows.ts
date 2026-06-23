/**
 * Standard (daily / weekly / monthly) window definitions and key computation.
 *
 * Hack night windows are NOT computed here — they follow the published Luma
 * calendar events stored in D1. Use `getHacknightForTime()` in lib/db.ts to
 * decide whether a timestamp falls inside a published session.
 */

export type WindowType = "hacknight" | "daily" | "weekly" | "monthly";

export interface WindowInfo {
  type: WindowType;
  key: string; // e.g. "hn-42", "2026-05-21", "2026-W21", "2026-05"
  startMs: number;
  endMs: number;
}

// ─── ISO helpers (UTC) ───────────────────────────────────────────────────────

/** "2026-05-21" from a Date */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "2026-05" from a Date */
export function isoMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** ISO week key "2026-W21" (ISO 8601 week, Monday-anchored) */
export function isoWeek(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayOfWeek = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ─── Daily / Weekly / Monthly windows ───────────────────────────────────────

export function dailyWindow(nowMs: number): WindowInfo {
  const d = new Date(nowMs);
  const key = isoDay(d);
  const startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const endMs = startMs + 86_400_000;
  return { type: "daily", key, startMs, endMs };
}

export function weeklyWindow(nowMs: number): WindowInfo {
  const d = new Date(nowMs);
  const key = isoWeek(d);
  const dow = (d.getUTCDay() + 6) % 7; // 0=Mon … 6=Sun
  const startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
  const endMs = startMs + 7 * 86_400_000;
  return { type: "weekly", key, startMs, endMs };
}

export function monthlyWindow(nowMs: number): WindowInfo {
  const d = new Date(nowMs);
  const key = isoMonth(d);
  const startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const endMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { type: "monthly", key, startMs, endMs };
}

/** All standard windows that always apply */
export function standardWindows(nowMs: number): WindowInfo[] {
  return [dailyWindow(nowMs), weeklyWindow(nowMs), monthlyWindow(nowMs)];
}
