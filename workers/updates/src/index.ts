import type { D1Database, ExecutionContext } from "@cloudflare/workers-types";

interface Env {
  DB: D1Database;
  REPORT_TOKEN?: string; // if set, GET /report requires X-Report-Token to match
}

// Map each release channel to its upstream GitHub static update manifest.
// stable = the rolling "latest" release; rc = the fixed "rc" prerelease.
// A channel that isn't here resolves to 404 (non-2XX) so the Tauri client falls
// through to its own baked-in GitHub fallback endpoint — see handleProxy.
// Note: the rc feed 404s until the first rc-* release exists; until then RC
// checks return non-2XX here AND on the client's GitHub fallback, which the
// updater treats as "no update" — benign recurring check errors, not a bug.
const FEEDS: Record<string, string> = {
  stable: "https://github.com/cbnsndwch/pacebar/releases/latest/download/latest.json",
  rc: "https://github.com/cbnsndwch/pacebar/releases/download/rc/latest.json",
};

const ACTIVE_WINDOW_DAYS = 30;

function cors(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
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

/** Accept only short, sane path segments — reject anything else. */
function seg(value: string, max = 64): string | null {
  return value.length > 0 && value.length <= max ? value : null;
}

/**
 * Record one anonymous update check as a per-day rollup row, so the table stays
 * small and doubles as an adoption-over-time series. No identifier, no PII —
 * just which channel/target/arch/version is polling, plus coarse country.
 * Best-effort: callers run this via ctx.waitUntil and swallow errors so logging
 * can never affect the proxied response.
 */
async function logCheck(
  env: Env,
  f: {
    day: string;
    channel: string;
    target: string;
    arch: string;
    version: string;
    country: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO update_checks (day, channel, target, arch, app_version, country, hits)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
     ON CONFLICT(day, channel, target, arch, app_version, country) DO UPDATE SET
       hits = hits + 1`,
  )
    .bind(f.day, f.channel, f.target, f.arch, f.version, f.country)
    .run();
}

/**
 * Proxy the channel's upstream latest.json verbatim, logging the poll first.
 * FAIL-OPEN CONTRACT: every failure path returns a non-2XX status so the Tauri
 * updater falls through to the client's own direct-GitHub fallback endpoint.
 * Never return 204 or an empty 200 here — a 2XX stops fallthrough, and 204 means
 * "no update available", either of which would silently suppress a real update.
 */
async function handleProxy(
  channel: string,
  target: string,
  arch: string,
  version: string,
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const upstream = FEEDS[channel];
  if (!upstream) return json({ error: "unknown channel" }, 404);

  // Log the poll (fire-and-forget). The fields come from the URL the client
  // built, independent of whether an update is actually available.
  const nowIso = new Date().toISOString();
  const country = (req as unknown as { cf?: { country?: string } }).cf?.country ?? "";
  ctx.waitUntil(
    logCheck(env, { day: nowIso.slice(0, 10), channel, target, arch, version, country }).catch(
      () => {},
    ),
  );

  // Manifest-only passthrough: the per-platform asset URLs are absolute GitHub
  // links and the signature is embedded, so the bundle + .sig downloads bypass
  // this worker entirely. Stream the upstream bytes through unmodified.
  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, { headers: { Accept: "application/json" } });
  } catch {
    return json({ error: "upstream unreachable" }, 502); // non-2XX → client falls through
  }
  if (!upstreamRes.ok) {
    return json({ error: "upstream error", status: upstreamRes.status }, 502);
  }

  let body: string;
  try {
    body = await upstreamRes.text();
  } catch {
    return json({ error: "upstream read failed" }, 502); // non-2XX → client falls through
  }
  return cors(new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }));
}

async function handleReport(req: Request, env: Env): Promise<Response> {
  if (env.REPORT_TOKEN && req.headers.get("X-Report-Token") !== env.REPORT_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  const total = await env.DB.prepare(
    `SELECT COALESCE(SUM(hits), 0) AS n FROM update_checks WHERE day >= ?1`,
  )
    .bind(cutoff)
    .first<{ n: number }>();

  // col comes only from the fixed allow-list below — never from user input.
  const group = async (col: string) =>
    (
      await env.DB.prepare(
        `SELECT ${col} AS key, SUM(hits) AS n FROM update_checks
         WHERE day >= ?1 GROUP BY ${col} ORDER BY n DESC`,
      )
        .bind(cutoff)
        .all<{ key: string; n: number }>()
    ).results;

  const perDay = (
    await env.DB.prepare(
      `SELECT day, channel, SUM(hits) AS n FROM update_checks
       WHERE day >= ?1 GROUP BY day, channel ORDER BY day DESC`,
    )
      .bind(cutoff)
      .all<{ day: string; channel: string; n: number }>()
  ).results;

  return json({
    windowDays: ACTIVE_WINDOW_DAYS,
    totalChecks: total?.n ?? 0,
    byChannel: await group("channel"),
    byVersion: await group("app_version"),
    byTarget: await group("target"),
    byArch: await group("arch"),
    byCountry: await group("country"),
    perDay,
  });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/$/, "");

    if (req.method === "GET" && (pathname === "" || pathname === "/health")) {
      return json({ ok: true });
    }
    if (req.method === "GET" && pathname === "/report") return handleReport(req, env);

    // Proxy route: /:channel/:target/:arch/:version — matched LAST so it can't
    // shadow /health or /report.
    const m = pathname.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (req.method === "GET" && m) {
      const channel = seg(m[1]);
      const target = seg(m[2]);
      const arch = seg(m[3]);
      const version = seg(m[4]);
      if (channel && target && arch && version) {
        return handleProxy(channel, target, arch, version, req, env, ctx);
      }
    }

    return json({ error: "not found" }, 404);
  },
};
