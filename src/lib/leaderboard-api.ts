/** Typed fetch helpers for the PaceBar Leaderboard CF Worker. */

export type LeaderboardWindow = "hacknight" | "daily" | "weekly" | "monthly"
export type LeaderboardMetric = "tokens" | "dollars" | "providers" | "score"

export interface LeaderboardEntry {
  rank:             number
  handle:           string
  tokens_used:      number
  dollars_spent:    number
  providers_active: number
  score:            number
}

export interface LeaderboardResponse {
  window:  string
  metric:  string
  entries: LeaderboardEntry[]
}

export interface HacknightInfo {
  number:    number
  title:     string
  is_special: boolean
  starts_at: string
  ends_at:   string
}

export interface HacknightCurrentResponse {
  active:    boolean
  slot?:     string
  hacknight?: HacknightInfo
  upcoming?:  { number: number; starts_at: string }
}

function makeHeaders(token: string | null): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" }
  if (token) h["X-Invite-Token"] = token
  return h
}

export async function fetchLeaderboard(
  workerUrl: string,
  token: string | null,
  window: LeaderboardWindow,
  metric: LeaderboardMetric,
  hacknightN?: number
): Promise<LeaderboardResponse> {
  const base = workerUrl.replace(/\/$/, "")
  let qs = `window=${window}&metric=${metric}`
  if (window === "hacknight" && hacknightN != null) {
    qs += `&n=${hacknightN}`
  }
  const res = await fetch(`${base}/api/v1/leaderboard?${qs}`, {
    headers: makeHeaders(token),
  })
  if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`)
  return res.json() as Promise<LeaderboardResponse>
}

export async function fetchCurrentHacknight(
  workerUrl: string,
  token: string | null
): Promise<HacknightCurrentResponse> {
  const base = workerUrl.replace(/\/$/, "")
  const res = await fetch(`${base}/api/v1/hacknight/current`, {
    headers: makeHeaders(token),
  })
  if (!res.ok) throw new Error(`Hacknight fetch failed: ${res.status}`)
  return res.json() as Promise<HacknightCurrentResponse>
}
