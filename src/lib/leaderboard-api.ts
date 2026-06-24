/** Typed fetch helpers for the PaceBar Leaderboard CF Worker. */

export type LeaderboardWindow = "hacknight" | "daily" | "weekly" | "monthly";
export type LeaderboardMetric = "tokens" | "dollars" | "providers" | "score";
export type LeaderboardGroupBy = "users" | "model";

export interface PerModelUsage {
  provider_id: string;
  model_id: string;
  model_name: string | null;
  tokens_total: number;
  tokens_in: number | null;
  tokens_out: number | null;
  dollars_spent: number;
}

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  tokens_used: number;
  dollars_spent: number;
  providers_active: number;
  score: number;
  models?: Record<string, PerModelUsage>;
}

export interface ModelLeaderboardEntry {
  rank: number;
  model_key: string;
  provider_id: string;
  model_id: string;
  model_name: string | null;
  tokens_used: number;
  dollars_spent: number;
  users: number;
  top_handle: string | null;
  top_tokens: number;
}

export interface LeaderboardResponse<T = LeaderboardEntry> {
  window: string;
  windowKey: string;
  metric: string;
  groupBy: LeaderboardGroupBy;
  entries: T[];
  fetchedAt: string;
}

export interface HacknightInfo {
  number: number;
  title: string;
  is_special: boolean;
  starts_at: string;
  ends_at: string;
}

export interface HacknightCurrentResponse {
  active: boolean;
  hacknight?: HacknightInfo;
  /** Upcoming published sessions (soonest first); present when no session is active. */
  upcoming?: HacknightInfo[];
}

export interface HacknightWinner {
  id: number;
  hacknight_id: number;
  category: "overall" | "model";
  metric: string;
  handle: string;
  value: number;
  computed_at: string;
}

function makeHeaders(token: string | null): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["X-Invite-Token"] = token;
  return h;
}

export async function fetchLeaderboard(
  workerUrl: string,
  token: string | null,
  window: LeaderboardWindow,
  metric: LeaderboardMetric,
  hacknightN?: number,
  groupBy: LeaderboardGroupBy = "users",
): Promise<LeaderboardResponse> {
  const base = workerUrl.replace(/\/$/, "");
  let qs = `window=${window}&metric=${metric}&groupBy=${groupBy}`;
  if (window === "hacknight" && hacknightN != null) {
    qs += `&n=${hacknightN}`;
  }
  const res = await fetch(`${base}/api/v1/leaderboard?${qs}`, {
    headers: makeHeaders(token),
  });
  if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`);
  return res.json() as Promise<LeaderboardResponse>;
}

export async function fetchModelLeaderboard(
  workerUrl: string,
  token: string | null,
  window: LeaderboardWindow,
  metric: LeaderboardMetric = "tokens",
  hacknightN?: number,
): Promise<LeaderboardResponse<ModelLeaderboardEntry>> {
  const base = workerUrl.replace(/\/$/, "");
  let qs = `window=${window}&metric=${metric}&groupBy=model`;
  if (window === "hacknight" && hacknightN != null) {
    qs += `&n=${hacknightN}`;
  }
  const res = await fetch(`${base}/api/v1/leaderboard?${qs}`, {
    headers: makeHeaders(token),
  });
  if (!res.ok) throw new Error(`Model leaderboard fetch failed: ${res.status}`);
  return res.json() as Promise<LeaderboardResponse<ModelLeaderboardEntry>>;
}

export async function fetchCurrentHacknight(
  workerUrl: string,
  token: string | null,
): Promise<HacknightCurrentResponse> {
  const base = workerUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/v1/hacknight/current`, {
    headers: makeHeaders(token),
  });
  if (!res.ok) throw new Error(`Hacknight fetch failed: ${res.status}`);
  return res.json() as Promise<HacknightCurrentResponse>;
}

export async function fetchHacknightWinners(
  workerUrl: string,
  token: string | null,
  number: number,
): Promise<{ hacknight: HacknightInfo; winners: HacknightWinner[] }> {
  const base = workerUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/v1/hacknight/${number}/winners`, {
    headers: makeHeaders(token),
  });
  if (!res.ok) throw new Error(`Hacknight winners fetch failed: ${res.status}`);
  return res.json() as Promise<{ hacknight: HacknightInfo; winners: HacknightWinner[] }>;
}
