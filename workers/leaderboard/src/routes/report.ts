import type { D1Database } from "@cloudflare/workers-types";

import { buildSnapshotModels } from "../lib/leaderboard-helpers";
import { upsertReport, getHacknightForTime, insertModelUsageSnapshot } from "../lib/db";
import { standardWindows } from "../lib/windows";

interface ProviderPayload {
  id: string;
  displayName: string;
  plan?: string | null;
  tokensUsed: number;
  dollarsSpent: number;
}

interface ModelPayload {
  providerId: string;
  modelId: string;
  modelName?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  tokensTotal?: number | null;
  dollarsSpent?: number | null;
}

interface ReportPayload {
  handle: string;
  submittedAt: string;
  providers: ProviderPayload[];
  models?: ModelPayload[];
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function handleReport(req: Request, db: D1Database): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !isString((body as ReportPayload).handle) ||
    !isString((body as ReportPayload).submittedAt) ||
    !Array.isArray((body as ReportPayload).providers)
  ) {
    return jsonError("missing required fields: handle, submittedAt, providers[]", 400);
  }

  const { handle, submittedAt, providers, models } = body as ReportPayload;

  const cleanHandle = handle.trim().slice(0, 64);
  if (!cleanHandle) return jsonError("handle must not be empty", 400);

  const nowMs = Date.parse(submittedAt);
  if (isNaN(nowMs)) return jsonError("submittedAt is not a valid ISO 8601 timestamp", 400);

  // Aggregate totals
  let tokensUsed = 0;
  let dollarsSpent = 0;
  let providersActive = 0;

  const cleanProviders: ProviderPayload[] = [];
  for (const p of providers) {
    if (!p || typeof p !== "object") continue;
    const tokens = typeof p.tokensUsed === "number" ? Math.max(0, Math.round(p.tokensUsed)) : 0;
    const dollars = typeof p.dollarsSpent === "number" ? Math.max(0, p.dollarsSpent) : 0;
    tokensUsed += tokens;
    dollarsSpent += dollars;
    if (tokens > 0 || dollars > 0) providersActive++;
    cleanProviders.push({ ...p, tokensUsed: tokens, dollarsSpent: dollars });
  }

  const score = dollarsSpent * 100 + tokensUsed / 1_000_000;

  // Always write standard windows
  const standard = standardWindows(nowMs);
  const upserts: Promise<void>[] = standard.map((w) =>
    upsertReport(db, {
      handle: cleanHandle,
      submitted_at: submittedAt,
      window_type: w.type,
      hacknight_id: null,
      window_key: w.key,
      tokens_used: tokensUsed,
      dollars_spent: dollarsSpent,
      providers_active: providersActive,
      score,
      providers_json: JSON.stringify(cleanProviders),
    }),
  );

  // Record a hack night window only if the report falls inside a published
  // session (the source of truth is the Luma calendar synced into D1).
  const hn = await getHacknightForTime(db, submittedAt);
  if (hn) {
    upserts.push(
      upsertReport(db, {
        handle: cleanHandle,
        submitted_at: submittedAt,
        window_type: "hacknight",
        hacknight_id: hn.id,
        window_key: `hn-${hn.number}`,
        tokens_used: tokensUsed,
        dollars_spent: dollarsSpent,
        providers_active: providersActive,
        score,
        providers_json: JSON.stringify(cleanProviders),
      }),
    );
  }

  await Promise.all(upserts);

  // ── Persist per-model usage snapshots ──────────────────────────────────────
  const snapshotModels = buildSnapshotModels(models, cleanProviders);
  await Promise.all(
    snapshotModels.map((m) =>
      insertModelUsageSnapshot(db, {
        handle: cleanHandle,
        provider_id: m.providerId,
        model_id: m.modelId,
        model_name: m.modelName ?? null,
        recorded_at: submittedAt,
        tokens_in: m.tokensIn ?? null,
        tokens_out: m.tokensOut ?? null,
        tokens_total: m.tokensTotal ?? 0,
        dollars_spent: m.dollarsSpent ?? 0,
        raw_json: JSON.stringify(m),
      }),
    ),
  );

  return json({
    ok: true,
    windows: standard.map((w) => w.key).concat(hn ? ["hacknight"] : []),
  });
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
