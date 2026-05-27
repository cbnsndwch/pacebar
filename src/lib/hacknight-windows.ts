/**
 * Hack night window detection for the browser/frontend.
 * Mirrors the logic in workers/leaderboard/src/lib/windows.ts but operates
 * on Date objects rather than millisecond timestamps.
 *
 * Windows (America/New_York):
 *  - Tuesday 18:30 → Wednesday 06:00
 *  - Thursday 18:00 → Thursday 24:00 (midnight)
 */

const TZ = "America/New_York"

/** Returns the current weekday (0=Sun…6=Sat) and minutes-since-midnight in ET. */
function etParts(now: Date): { dow: number; mins: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? ""
  const hourStr    = parts.find((p) => p.type === "hour")?.value ?? "0"
  const minuteStr  = parts.find((p) => p.type === "minute")?.value ?? "0"

  const weekdays: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  const dow  = weekdays[weekdayStr] ?? 0
  const hour = parseInt(hourStr, 10)
  // Intl hour12:false can return "24" for midnight
  const mins = (hour === 24 ? 0 : hour) * 60 + parseInt(minuteStr, 10)
  return { dow, mins }
}

/**
 * Returns which hack night slot is currently active, or `null` if we are
 * outside all windows.
 */
export function currentHacknightSlot(now = new Date()): "tuesday" | "thursday" | null {
  const { dow, mins } = etParts(now)

  // Tuesday window: Tue 18:30 → Wed 06:00
  if (dow === 2 && mins >= 18 * 60 + 30) return "tuesday"
  if (dow === 3 && mins < 6 * 60)         return "tuesday"

  // Thursday window: Thu 18:00 → Thu 24:00
  if (dow === 4 && mins >= 18 * 60) return "thursday"

  return null
}

/** Returns true if we are currently inside any hack night window. */
export function isInHacknightWindow(now = new Date()): boolean {
  return currentHacknightSlot(now) !== null
}
