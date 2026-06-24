# Cloudflare AI (Self-Hosted Gateway)

Tracks spend from a **self-hosted Cloudflare Worker** that meters AI model usage through a proxy gateway. This plugin does **not** connect to Cloudflare's managed AI Gateway product — it requires a custom Worker you deploy and own.

## Who Is This For?

You run a Cloudflare Worker that:
- Proxies AI model requests (e.g. to Anthropic, OpenAI, or `@cf/` models)
- Tracks per-request costs in Cloudflare D1 or KV
- Exposes `GET /api/stats` returning spend data

If you don't have this yet, the [Worker setup guide](#building-your-gateway-worker) below walks you through building one.

---

## Setup in PaceBar

Open **Settings → Cloudflare AI (Gateway)** and fill in:

| Field | What to put |
|-------|-------------|
| **Gateway URL** | Your Worker's base URL, e.g. `https://my-gateway.workers.dev` |
| **Router Key** | The secret you set as `ROUTER_SECRET` in your Worker |

PaceBar saves these in your local app data — no env vars or config files needed.

### Alternative: environment variables

If you prefer not to store credentials in the app:

```bash
export CF_GATEWAY_URL="https://my-gateway.workers.dev"
export CF_ROUTER_KEY="your-router-secret"
```

Env vars take priority over the settings UI if both are set.

---

## Menu Bar

The menu bar shows the **total tokens** (input + output) used in a configurable rolling window. Pick the window under **Settings → Cloudflare AI (Gateway) → Token Window**: **Last hour**, **Last 24h** (default), or **Last 7d**. PaceBar requests `GET /api/stats?window=1h|24h|7d` and displays the abbreviated count (e.g. `1.2M`).

## Required API Response

Your Worker's `GET /api/stats` takes an optional `?window=1h|24h|7d` query param and must return:

```json
{
  "cap_usd": 50000,
  "spent_usd": 1234.56,
  "remaining_usd": 48765.44,
  "burn_per_day_usd": 42.50,
  "total_requests": 1500,
  "total_tokens_in": 5000000,
  "total_tokens_out": 2000000,
  "hosted_only_ok": true
}
```

| Field | Type | Windowed? | Description |
|-------|------|-----------|-------------|
| `cap_usd` | number | no | Spending cap in USD |
| `spent_usd` | number | no | Total spend so far |
| `remaining_usd` | number | no | `cap_usd - spent_usd` (optional, PaceBar computes it) |
| `burn_per_day_usd` | number | no | 7-day rolling average spend rate |
| `total_requests` | number | **yes** | Requests in the selected window |
| `total_tokens_in` | number | **yes** | Input tokens in the selected window |
| `total_tokens_out` | number | **yes** | Output tokens in the selected window |
| `hosted_only_ok` | boolean | no | Whether all traffic went to hosted-only models |

**Windowed fields** (`total_requests`, `total_tokens_in/out`) should reflect only the requested window. If you ignore the `window` param and always return lifetime totals, the plugin still works — the menu bar just won't change between windows.

---

## Building Your Gateway Worker

### 1. Create the Worker project

```bash
npm create cloudflare@latest my-ai-gateway -- --type worker
cd my-ai-gateway
```

### 2. Create a D1 database for usage tracking

```bash
wrangler d1 create ai-gateway-db
```

Copy the output `database_id` into your `wrangler.jsonc`:

```jsonc
{
  "name": "my-ai-gateway",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ai-gateway-db",
      "database_id": "<your-database-id>"
    }
  ]
}
```

### 3. Create the schema

```bash
wrangler d1 execute ai-gateway-db --local --command "
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO config VALUES ('cap_usd', '50000');
INSERT OR IGNORE INTO config VALUES ('hosted_only_ok', 'true');
"
```

### 4. Write the Worker

Replace `src/index.ts` with:

```typescript
export interface Env {
  DB: D1Database;
  ROUTER_SECRET: string;
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function checkAuth(request: Request, env: Env): boolean {
  const auth = request.headers.get("Authorization") ?? "";
  return auth === `Bearer ${env.ROUTER_SECRET}`;
}

// Map the window query param to a number of seconds.
function windowSeconds(window: string | null): number {
  switch (window) {
    case "1h":
      return 3600;
    case "7d":
      return 7 * 86400;
    case "24h":
    default:
      return 86400;
  }
}

async function handleStats(env: Env, window: string | null): Promise<Response> {
  const db = env.DB;
  const since = Math.floor(Date.now() / 1000) - windowSeconds(window);

  const [windowed, lifetime, burn, cfg] = await Promise.all([
    // Windowed token/request counts for the menu bar.
    db
      .prepare(
        "SELECT COUNT(*) as reqs, SUM(tokens_in) as tin, SUM(tokens_out) as tout FROM requests WHERE created_at > ?1"
      )
      .bind(since)
      .first<{ reqs: number; tin: number; tout: number }>(),
    // Lifetime spend (account-level, not windowed).
    db
      .prepare("SELECT SUM(cost_usd) as spent FROM requests")
      .first<{ spent: number }>(),
    // 7-day burn rate.
    db
      .prepare("SELECT SUM(cost_usd) as weekly FROM requests WHERE created_at > ?1")
      .bind(Math.floor(Date.now() / 1000) - 7 * 86400)
      .first<{ weekly: number }>(),
    db
      .prepare("SELECT key, value FROM config WHERE key IN ('cap_usd', 'hosted_only_ok')")
      .all<{ key: string; value: string }>(),
  ]);

  const configMap = Object.fromEntries(
    (cfg.results ?? []).map((r) => [r.key, r.value])
  );
  const cap = parseFloat(configMap["cap_usd"] ?? "50000");
  const hostedOnly = configMap["hosted_only_ok"] !== "false";
  const spent = lifetime?.spent ?? 0;
  const burnPerDay = (burn?.weekly ?? 0) / 7;

  return new Response(
    JSON.stringify({
      cap_usd: cap,
      spent_usd: spent,
      remaining_usd: cap - spent,
      burn_per_day_usd: burnPerDay,
      total_requests: windowed?.reqs ?? 0,
      total_tokens_in: windowed?.tin ?? 0,
      total_tokens_out: windowed?.tout ?? 0,
      hosted_only_ok: hostedOnly,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

async function handleProxy(
  request: Request,
  env: Env,
  upstream: string
): Promise<Response> {
  // Forward to upstream AI provider
  const url = new URL(request.url);
  const targetUrl = upstream + url.pathname + url.search;
  const proxyReq = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  const resp = await fetch(proxyReq);

  // Record usage from response headers (provider-specific)
  const inputTokens = parseInt(resp.headers.get("anthropic-input-tokens") ?? "0");
  const outputTokens = parseInt(resp.headers.get("anthropic-output-tokens") ?? "0");
  const model = url.pathname.split("/").pop() ?? "unknown";

  // Rough Anthropic pricing ($/MTok) — adjust per your models
  const costPerInputMTok = 3.0;
  const costPerOutputMTok = 15.0;
  const cost =
    (inputTokens * costPerInputMTok + outputTokens * costPerOutputMTok) / 1_000_000;

  if (inputTokens > 0 || outputTokens > 0) {
    await env.DB.prepare(
      "INSERT INTO requests (model, tokens_in, tokens_out, cost_usd, created_at) VALUES (?1, ?2, ?3, ?4, ?5)"
    )
      .bind(model, inputTokens, outputTokens, cost, Math.floor(Date.now() / 1000))
      .run();
  }

  return resp;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Stats endpoint — requires auth
    if (request.method === "GET" && url.pathname === "/api/stats") {
      if (!checkAuth(request, env)) return unauthorized();
      return handleStats(env, url.searchParams.get("window"));
    }

    // Proxy all other requests to Anthropic (adjust upstream for other providers)
    const upstream = "https://api.anthropic.com";
    return handleProxy(request, env, upstream);
  },
};
```

### 5. Set the router secret

```bash
wrangler secret put ROUTER_SECRET
# Paste a strong random string when prompted
```

### 6. Deploy

```bash
wrangler deploy
```

Your gateway URL will be `https://my-ai-gateway.<your-subdomain>.workers.dev`.

### 7. Run the schema against production

```bash
wrangler d1 execute ai-gateway-db --command "
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO config VALUES ('cap_usd', '50000');
INSERT OR IGNORE INTO config VALUES ('hosted_only_ok', 'true');
"
```

### 8. Configure PaceBar

Open Settings and enter your Worker URL and the `ROUTER_SECRET` value you set. Done.

---

## Metrics

| Label | Description |
|-------|-------------|
| **Tokens** | Total tokens (in + out) in the selected window — shown in the menu bar |
| **Spend** | Total cost so far |
| **Daily burn** | 7-day rolling average spend per day |
| **Remaining** | `cap - spent` |
| **Models** | "Hosted-only" (green) or "Mixed" (red) badge |
| **Requests** | Requests · tokens in the selected window |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| "Needs Gateway" | Enter Gateway URL in PaceBar Settings, or set `CF_GATEWAY_URL` env var |
| "Auth needed" | Enter Router Key in PaceBar Settings, or set `CF_ROUTER_KEY` env var |
| "Auth failed" | Key doesn't match `ROUTER_SECRET` in your Worker |
| "Offline" | Worker URL unreachable — check `wrangler tail` for errors |
| "Invalid data" | `/api/stats` returned non-JSON — verify your Worker is deployed correctly |
