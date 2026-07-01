import type { D1Database, ExecutionContext } from "@cloudflare/workers-types";

interface Env {
  DB: D1Database;
  REPORT_TOKEN?: string; // if set, GET /report requires X-Report-Token to match
  GITHUB_TOKEN?: string; // optional: raises the GitHub API rate limit for rc resolution
}

const REPO = "cbnsndwch/pacebar";

// stable = GitHub's built-in "latest" (newest non-prerelease) release manifest,
// served from a stable per-version release URL.
const STABLE_FEED = `https://github.com/${REPO}/releases/latest/download/latest.json`;

// The rc channel has no built-in "latest prerelease" pointer, so we resolve the
// newest rc-MAJOR.MINOR.PATCH[-N] prerelease dynamically (see resolveRcManifest)
// and serve its per-version latest.json. Each rc release is immutable with
// unique asset URLs, which avoids the stale-CDN update loop that a reused
// rolling "rc" release caused (unversioned macOS artifacts at a stable URL).
const RC_TAG_RE = /^rc-(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/;
const RC_MANIFEST_TTL_SECONDS = 120;

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

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}
interface GitHubRelease {
  tag_name: string;
  prerelease: boolean;
  assets: GitHubAsset[];
}

function ghHeaders(env: Env): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": "pacebar-ota",
    Accept: "application/vnd.github+json",
  };
  if (env.GITHUB_TOKEN) h.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return h;
}

/** Parse an rc tag ("rc-1.2.3" or "rc-1.2.3-4") into a comparable tuple. */
function parseRcTag(tag: string): [number, number, number, number] | null {
  const m = tag.match(RC_TAG_RE);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : 0];
}

function cmpVer(a: number[], b: number[]): number {
  for (let i = 0; i < 4; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Resolve the newest rc-* prerelease and return its latest.json body, or null if
 * no rc release exists yet. Throws on network/API errors (caller fails open).
 */
async function resolveRcManifest(env: Env): Promise<string | null> {
  const listRes = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=50`, {
    headers: ghHeaders(env),
  });
  if (!listRes.ok) throw new Error(`releases list ${listRes.status}`);
  const releases = (await listRes.json()) as GitHubRelease[];

  let best: GitHubRelease | null = null;
  let bestVer: number[] | null = null;
  for (const r of releases) {
    if (!r.prerelease) continue;
    const v = parseRcTag(r.tag_name);
    if (!v) continue;
    if (!bestVer || cmpVer(v, bestVer) > 0) {
      best = r;
      bestVer = v;
    }
  }
  if (!best) return null;

  const asset = (best.assets || []).find((a) => a.name === "latest.json");
  if (!asset) throw new Error(`no latest.json asset on ${best.tag_name}`);

  const manRes = await fetch(asset.browser_download_url, {
    headers: { "User-Agent": "pacebar-ota", Accept: "application/octet-stream" },
  });
  if (!manRes.ok) throw new Error(`manifest fetch ${manRes.status}`);
  return await manRes.text();
}

/**
 * Cached wrapper around resolveRcManifest. Caches the resolved manifest at the
 * edge for RC_MANIFEST_TTL_SECONDS so per-poll GitHub API calls stay well under
 * the rate limit no matter how many installs are polling.
 */
async function getRcManifest(env: Env, ctx: ExecutionContext): Promise<string | null> {
  const cacheKey = new Request("https://pacebar-ota.internal/rc/latest.json");
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return await hit.text();

  const body = await resolveRcManifest(env);
  if (body == null) return null;

  const cached = new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `max-age=${RC_MANIFEST_TTL_SECONDS}`,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, cached));
  return body;
}

/**
 * Serve the channel's latest.json, logging the poll first. stable = the static
 * "latest release" manifest; rc = the newest rc-* prerelease (resolved
 * dynamically, edge-cached).
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
  if (channel !== "stable" && channel !== "rc") {
    return json({ error: "unknown channel" }, 404);
  }

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
  // this worker entirely. Stream the manifest bytes through unmodified.
  let body: string;
  try {
    if (channel === "rc") {
      const rc = await getRcManifest(env, ctx);
      // No rc release yet → non-2XX so the client falls through (treated as
      // "no update"), never a 2XX/204 that would suppress a real update.
      if (rc == null) return json({ error: "no rc release" }, 404);
      body = rc;
    } else {
      const upstreamRes = await fetch(STABLE_FEED, { headers: { Accept: "application/json" } });
      if (!upstreamRes.ok) {
        return json({ error: "upstream error", status: upstreamRes.status }, 502);
      }
      body = await upstreamRes.text();
    }
  } catch {
    return json({ error: "resolve failed" }, 502); // non-2XX → client falls through
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
