import type { D1Database, ExecutionContext, ScheduledController } from "@cloudflare/workers-types";

import {
  getSyncState,
  recordSyncFailure,
  recordSyncSuccess,
  upsertHacknight,
} from "./lib/db";
import { fetchLumaHacknights } from "./lib/luma";
import {
  handleHacknightByNumber,
  handleHacknightCurrent,
  handleHacknightList,
} from "./routes/hacknight";
import { handleLeaderboard } from "./routes/leaderboard";
import { handleReport } from "./routes/report";

interface Env {
  DB: D1Database;
  INVITE_TOKEN: string;
  LUMA_ICAL_URL?: string;
}

function cors(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, X-Invite-Token");
  return new Response(res.body, { status: res.status, headers: h });
}

function json(data: unknown, status = 200): Response {
  return cors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function requireToken(req: Request, env: Env): boolean {
  // If no INVITE_TOKEN is configured (dev mode), skip auth
  if (!env.INVITE_TOKEN) return true;
  const token = req.headers.get("X-Invite-Token");
  return token === env.INVITE_TOKEN;
}

/**
 * Sync the Luma calendar into D1. Shared by the daily cron and the ad-hoc
 * POST /api/v1/sync route. Records success/failure in sync_state and re-throws
 * on any failure so the caller (cron) is marked unhealthy.
 */
async function runSync(env: Env): Promise<{ upserted: number; total: number }> {
  const startedAt = new Date().toISOString();
  try {
    const events = await fetchLumaHacknights(env.LUMA_ICAL_URL);

    const results = await Promise.allSettled(
      events.map((e) =>
        upsertHacknight(env.DB, {
          number: e.number,
          title: e.title,
          is_special: e.is_special ? 1 : 0,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
        }),
      ),
    );

    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    console.log(`Luma sync: ${ok} upserted, ${failed} failed (${events.length} total events)`);

    // Surface partial failure so the cron run is marked unhealthy.
    if (failed > 0) {
      throw new Error(`Luma sync: ${failed}/${events.length} upserts failed`);
    }

    await recordSyncSuccess(env.DB, ok, startedAt);
    return { upserted: ok, total: events.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Best-effort record; don't let a logging failure mask the real error.
    await recordSyncFailure(env.DB, message, startedAt).catch(() => {});
    console.error("Luma sync failed:", err);
    throw err;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Preflight
    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/$/, "");

    // Health — no auth needed. Surfaces the last Luma sync so a silently
    // broken cron is visible without digging through CF logs.
    if (pathname === "/api/v1/health") {
      const sync = await getSyncState(env.DB).catch(() => null);
      return json({ ok: true, ts: new Date().toISOString(), sync });
    }

    // All other routes require the invite token
    if (!requireToken(req, env)) {
      return json({ error: "unauthorized" }, 401);
    }

    // POST /api/v1/report
    if (req.method === "POST" && pathname === "/api/v1/report") {
      return cors(await handleReport(req, env.DB));
    }

    // POST /api/v1/sync — ad-hoc Luma sync (same work the daily cron does)
    if (req.method === "POST" && pathname === "/api/v1/sync") {
      try {
        const result = await runSync(env);
        return json({ ok: true, ...result });
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502);
      }
    }

    // GET /api/v1/leaderboard
    if (req.method === "GET" && pathname === "/api/v1/leaderboard") {
      return cors(await handleLeaderboard(req, env.DB));
    }

    // GET /api/v1/hacknight/current
    if (req.method === "GET" && pathname === "/api/v1/hacknight/current") {
      return cors(await handleHacknightCurrent(req, env.DB));
    }

    // GET /api/v1/hacknight/list
    if (req.method === "GET" && pathname === "/api/v1/hacknight/list") {
      return cors(await handleHacknightList(req, env.DB));
    }

    // GET /api/v1/hacknight/:number
    const hnMatch = pathname.match(/^\/api\/v1\/hacknight\/(\d+)$/);
    if (req.method === "GET" && hnMatch) {
      return cors(await handleHacknightByNumber(req, env.DB, parseInt(hnMatch[1], 10)));
    }

    return json({ error: "not found" }, 404);
  },

  // Scheduled cron — sync Luma calendar daily. runSync re-throws on failure so
  // Cloudflare marks the invocation as failed (visible in the dashboard) rather
  // than silently swallowing it.
  async scheduled(_ctrl: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runSync(env);
  },
};
