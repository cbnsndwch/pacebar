import type { D1Database } from "@cloudflare/workers-types";

import {
  getHacknightByNumber,
  getHacknightUsage,
  getLeaderboard,
  hasHacknightWinners,
  recordHacknightWinner,
  type HacknightRow,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type UserUsage,
} from "../lib/db";
import { dailyWindow, monthlyWindow, weeklyWindow } from "../lib/windows";

const VALID_METRICS: LeaderboardMetric[] = ["tokens", "dollars", "providers", "score"];

function parseMetric(raw: string | null): LeaderboardMetric {
  if (raw && (VALID_METRICS as string[]).includes(raw)) return raw as LeaderboardMetric;
  return "tokens";
}

interface ExtendedLeaderboardEntry extends LeaderboardEntry {
  models?: Record<string, UserUsage["models"][string]>;
}

export async function handleLeaderboard(req: Request, db: D1Database): Promise<Response> {
  const url = new URL(req.url);
  const window = url.searchParams.get("window") ?? "hacknight";
  const metric = parseMetric(url.searchParams.get("metric"));
  const groupBy = url.searchParams.get("groupBy") ?? "users";
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();

  if (window !== "hacknight") {
    if (groupBy === "model") {
      return json({ windowKey: window, window, metric, groupBy, entries: [], fetchedAt: nowIso });
    }

    let windowKey: string;
    switch (window) {
      case "daily":
        windowKey = dailyWindow(nowMs).key;
        break;
      case "weekly":
        windowKey = weeklyWindow(nowMs).key;
        break;
      case "monthly":
        windowKey = monthlyWindow(nowMs).key;
        break;
      default:
        return jsonError(`unknown window: ${window}`, 400);
    }

    const entries = await getLeaderboard(db, windowKey, metric);
    return json({ windowKey, window, metric, groupBy, entries, fetchedAt: nowIso });
  }

  // ── Hack night: derive from per-model snapshots ────────────────────────────
  const hn = await resolveHacknight(db, url.searchParams.get("n"));
  if (!hn) {
    return json({
      windowKey: url.searchParams.get("n") ? `hn-${url.searchParams.get("n")}` : "hn-0",
      window,
      metric,
      groupBy,
      entries: [],
      fetchedAt: nowIso,
    });
  }

  const usage = await getHacknightUsage(db, hn);

  if (groupBy === "model") {
    const entries = buildModelEntries(usage, metric);
    await maybeArchiveWinners(db, hn, usage, nowIso);
    return json({
      windowKey: `hn-${hn.number}`,
      window,
      metric,
      groupBy,
      entries,
      fetchedAt: nowIso,
    });
  }

  const entries = buildUserEntries(usage, metric);
  await maybeArchiveWinners(db, hn, usage, nowIso);
  return json({
    windowKey: `hn-${hn.number}`,
    window,
    metric,
    groupBy,
    entries,
    fetchedAt: nowIso,
  });
}

async function resolveHacknight(db: D1Database, nRaw: string | null): Promise<HacknightRow | null> {
  if (nRaw) {
    const number = parseInt(nRaw, 10);
    if (Number.isNaN(number)) return null;
    return getHacknightByNumber(db, number);
  }

  // Default: latest hack night that has any reports.
  const latest = await db
    .prepare(
      `SELECT hacknight_id FROM reports WHERE window_type = 'hacknight' ORDER BY submitted_at DESC LIMIT 1`,
    )
    .first<{ hacknight_id: number }>();
  if (latest?.hacknight_id) {
    return getHacknightByNumber(db, latest.hacknight_id);
  }
  return null;
}

function buildUserEntries(
  usage: Awaited<ReturnType<typeof getHacknightUsage>>,
  metric: LeaderboardMetric,
) {
  const list: ExtendedLeaderboardEntry[] = Object.values(usage.byHandle).map((u) => ({
    rank: 0,
    handle: u.handle,
    tokens_used: u.tokens_total,
    dollars_spent: u.dollars_spent,
    providers_active: u.providers_active,
    score: u.score,
    models: u.models,
  }));

  list.sort((a, b) => {
    switch (metric) {
      case "dollars":
        return b.dollars_spent - a.dollars_spent;
      case "providers":
        return b.providers_active - a.providers_active;
      case "score":
        return b.score - a.score;
      case "tokens":
      default:
        return b.tokens_used - a.tokens_used;
    }
  });

  return list.map((e, idx) => ({ ...e, rank: idx + 1 }));
}

function buildModelEntries(
  usage: Awaited<ReturnType<typeof getHacknightUsage>>,
  metric: LeaderboardMetric,
) {
  const list = Object.values(usage.byModel).map((m) => ({
    rank: 0,
    model_key: m.modelKey,
    provider_id: m.provider_id,
    model_id: m.model_id,
    model_name: m.model_name,
    tokens_used: m.tokens_total,
    dollars_spent: m.dollars_spent,
    users: m.users,
    top_handle: m.topHandle,
    top_tokens: m.topTokens,
  }));

  list.sort((a, b) => {
    if (metric === "dollars") return b.dollars_spent - a.dollars_spent;
    return b.tokens_used - a.tokens_used;
  });

  return list.map((e, idx) => ({ ...e, rank: idx + 1 }));
}

async function maybeArchiveWinners(
  db: D1Database,
  hacknight: HacknightRow,
  usage: Awaited<ReturnType<typeof getHacknightUsage>>,
  nowIso: string,
): Promise<void> {
  if (new Date(hacknight.ends_at).getTime() > Date.now()) return;
  if (await hasHacknightWinners(db, hacknight.id)) return;

  const users = Object.values(usage.byHandle);
  if (users.length === 0) return;

  const top = (key: keyof UserUsage) => {
    const sorted = [...users].sort((a, b) => (b[key] as number) - (a[key] as number));
    return { handle: sorted[0].handle, value: sorted[0][key] as number };
  };

  await recordHacknightWinner(db, {
    hacknight_id: hacknight.id,
    category: "overall",
    metric: "tokens",
    handle: top("tokens_total").handle,
    value: top("tokens_total").value,
    computed_at: nowIso,
  });
  await recordHacknightWinner(db, {
    hacknight_id: hacknight.id,
    category: "overall",
    metric: "dollars",
    handle: top("dollars_spent").handle,
    value: top("dollars_spent").value,
    computed_at: nowIso,
  });
  await recordHacknightWinner(db, {
    hacknight_id: hacknight.id,
    category: "overall",
    metric: "providers",
    handle: top("providers_active").handle,
    value: top("providers_active").value,
    computed_at: nowIso,
  });
  await recordHacknightWinner(db, {
    hacknight_id: hacknight.id,
    category: "overall",
    metric: "score",
    handle: top("score").handle,
    value: top("score").value,
    computed_at: nowIso,
  });

  for (const model of Object.values(usage.byModel)) {
    if (model.topHandle == null) continue;
    await recordHacknightWinner(db, {
      hacknight_id: hacknight.id,
      category: "model",
      metric: model.modelKey,
      handle: model.topHandle,
      value: model.topTokens,
      computed_at: nowIso,
    });
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function jsonError(message: string, status: number): Response {
  return json({ error: message }, status);
}
