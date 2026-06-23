import type { D1Database, ExecutionContext, ScheduledController } from "@cloudflare/workers-types";

import { upsertHacknight } from "./lib/db";
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Preflight
    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/$/, "");

    // Health — no auth needed
    if (pathname === "/api/v1/health") {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    // All other routes require the invite token
    if (!requireToken(req, env)) {
      return json({ error: "unauthorized" }, 401);
    }

    // POST /api/v1/report
    if (req.method === "POST" && pathname === "/api/v1/report") {
      return cors(await handleReport(req, env.DB));
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

  // Scheduled cron — sync Luma calendar daily
  async scheduled(_ctrl: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const url = env.LUMA_ICAL_URL ?? "https://api.lu.ma/ical/v1/calendar/hello_miami";
    let events;
    try {
      events = await fetchLumaHacknights(url);
    } catch (err) {
      console.error("Luma sync failed:", err);
      return;
    }

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
  },
};
