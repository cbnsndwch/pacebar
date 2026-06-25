import type { D1Database } from "@cloudflare/workers-types";

interface Env {
  DB: D1Database;
  REPORT_TOKEN?: string; // if set, GET /report requires X-Report-Token to match
}

const ACTIVE_WINDOW_DAYS = 30;

function cors(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, X-Report-Token");
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

/** Accept only short, sane string fields — reject anything else loudly. */
function field(value: unknown, max = 64): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

async function handlePing(req: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const b = body as Record<string, unknown>;
  const id = field(b.id);
  const version = field(b.version);
  const os = field(b.os);
  const arch = field(b.arch);
  if (!id || !version || !os || !arch) {
    return json({ error: "missing id/version/os/arch" }, 400);
  }
  const country = (req as unknown as { cf?: { country?: string } }).cf?.country ?? null;
  const now = new Date().toISOString();

  // Upsert: insert on first sight, otherwise refresh last_seen + current build.
  await env.DB.prepare(
    `INSERT INTO installs (id, first_seen, last_seen, app_version, os, arch, country)
     VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET
       last_seen = ?2, app_version = ?3, os = ?4, arch = ?5, country = ?6`,
  )
    .bind(id, now, version, os, arch, country)
    .run();

  return cors(new Response(null, { status: 204 }));
}

async function handleReport(req: Request, env: Env): Promise<Response> {
  if (env.REPORT_TOKEN && req.headers.get("X-Report-Token") !== env.REPORT_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86_400_000).toISOString();

  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM installs`).first<{
    n: number;
  }>();
  const active = await env.DB.prepare(`SELECT COUNT(*) AS n FROM installs WHERE last_seen >= ?1`)
    .bind(cutoff)
    .first<{ n: number }>();

  const group = async (col: string) =>
    (
      await env.DB.prepare(
        `SELECT ${col} AS key, COUNT(*) AS n FROM installs
         WHERE last_seen >= ?1 GROUP BY ${col} ORDER BY n DESC`,
      )
        .bind(cutoff)
        .all<{ key: string; n: number }>()
    ).results;

  return json({
    totalInstalls: total?.n ?? 0,
    activeInstalls: active?.n ?? 0,
    activeWindowDays: ACTIVE_WINDOW_DAYS,
    byVersion: await group("app_version"),
    byOs: await group("os"),
    byArch: await group("arch"),
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (req.method === "POST" && url.pathname === "/ping") return handlePing(req, env);
    if (req.method === "GET" && url.pathname === "/report") return handleReport(req, env);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true });
    }
    return json({ error: "not found" }, 404);
  },
};
