/**
 * Hack night window definitions and key computation.
 * Shared between the Worker and (a copy of) the frontend.
 *
 * Windows (all times local to the event venue — America/New_York):
 *   Tuesday  18:30 → Wednesday 06:00  (11.5 h)
 *   Thursday 18:00 → Thursday  24:00  ( 6.0 h)
 */

export type WindowType = "hacknight" | "daily" | "weekly" | "monthly"

export interface WindowInfo {
  type: WindowType
  key: string              // e.g. "hn-42", "2026-05-21", "2026-W21", "2026-05"
  startMs: number
  endMs: number
}

// ─── ISO helpers (UTC) ───────────────────────────────────────────────────────

/** "2026-05-21" from a Date */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** "2026-05" from a Date */
export function isoMonth(d: Date): string {
  return d.toISOString().slice(0, 7)
}

/** ISO week key "2026-W21" (ISO 8601 week, Monday-anchored) */
export function isoWeek(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayOfWeek = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayOfWeek)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`
}

// ─── Daily / Weekly / Monthly windows ───────────────────────────────────────

export function dailyWindow(nowMs: number): WindowInfo {
  const d = new Date(nowMs)
  const key = isoDay(d)
  const startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const endMs   = startMs + 86_400_000
  return { type: "daily", key, startMs, endMs }
}

export function weeklyWindow(nowMs: number): WindowInfo {
  const d = new Date(nowMs)
  const key = isoWeek(d)
  const dow = (d.getUTCDay() + 6) % 7   // 0=Mon … 6=Sun
  const startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)
  const endMs   = startMs + 7 * 86_400_000
  return { type: "weekly", key, startMs, endMs }
}

export function monthlyWindow(nowMs: number): WindowInfo {
  const d = new Date(nowMs)
  const key = isoMonth(d)
  const startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  const endMs   = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  return { type: "monthly", key, startMs, endMs }
}

// ─── Hack night window detection ─────────────────────────────────────────────
//
// We work in America/New_York local time so the Tuesday / Thursday
// boundaries stay intuitive even during daylight-saving transitions.
// The Worker uses Intl.DateTimeFormat (available in Workers runtime).

function nyParts(ms: number) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    weekday: "short",
  })
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(p => [p.type, p.value]))
  return {
    weekday: parts.weekday as string,          // "Tue", "Thu", etc.
    hour:    parseInt(parts.hour,    10),
    minute:  parseInt(parts.minute,  10),
    year:    parseInt(parts.year,    10),
    month:   parseInt(parts.month,   10) - 1,  // 0-based
    day:     parseInt(parts.day,     10),
  }
}

/** Minutes since midnight NY time */
function nyMinutes(ms: number): number {
  const { hour, minute } = nyParts(ms)
  return hour * 60 + minute
}

/** IANA day-of-week index in NY (0=Sun … 6=Sat) */
function nyDow(ms: number): number {
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return days[nyParts(ms).weekday] ?? 0
}

/**
 * If `nowMs` falls inside a hack night window, return the window key
 * ("hn-pending" until we know the hacknight number from D1).
 * Otherwise return null.
 *
 * Tuesday  18:30 NY → Wednesday 06:00 NY
 * Thursday 18:00 NY → Thursday  24:00 NY (midnight = start of Friday)
 */
export function hacknightWindowKey(nowMs: number): "tuesday" | "thursday" | null {
  const dow     = nyDow(nowMs)
  const minutes = nyMinutes(nowMs)

  const TUE = 2, WED = 3, THU = 4

  // Tuesday session: Tue 18:30 → Wed 06:00
  if (dow === TUE && minutes >= 18 * 60 + 30) return "tuesday"
  if (dow === WED && minutes <  6  * 60)       return "tuesday"

  // Thursday session: Thu 18:00 → Thu 24:00 (i.e. before midnight = before Fri)
  if (dow === THU && minutes >= 18 * 60)       return "thursday"

  return null
}

/** All standard windows that always apply */
export function standardWindows(nowMs: number): WindowInfo[] {
  return [dailyWindow(nowMs), weeklyWindow(nowMs), monthlyWindow(nowMs)]
}
