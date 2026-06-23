# Cloudflare AI

Tracks usage from a self-hosted [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) router.

## Setup

### 1. Configure the plugin

The plugin auto-discovers your gateway in this order:

1. **`CF_GATEWAY_URL`** environment variable (e.g. `https://my-gateway.workers.dev`)
2. **`~/cloudflare-ai/opencode.json`** — reads the `baseURL` from your OpenCode config

### 2. Set your auth key

```bash
export CF_ROUTER_KEY="your-router-secret"
```

This is the `ROUTER_SECRET` you set when deploying the gateway via `wrangler secret put ROUTER_SECRET`.

### Metrics

- **Spend** — total spend vs cap (primary progress bar)
- **Daily burn** — 7-day average spend rate
- **Remaining** — remaining credit
- **Models** — hosted-only assertion badge
- **Requests** — total requests + token count

## Troubleshooting

- "Gateway URL not configured" — set `CF_GATEWAY_URL` or create `~/cloudflare-ai/opencode.json`
- "Auth key missing" — export `CF_ROUTER_KEY`
- "Auth failed" — check your `CF_ROUTER_KEY` matches the gateway's `ROUTER_SECRET`