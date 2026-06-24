import type { D1Database } from "@cloudflare/workers-types";

export interface HacknightRow {
  id: number;
  number: number;
  title: string;
  is_special: number;
  starts_at: string;
  ends_at: string;
}

export interface ReportRow {
  id: number;
  handle: string;
  submitted_at: string;
  window_type: string;
  hacknight_id: number | null;
  window_key: string;
  tokens_used: number;
  dollars_spent: number;
  providers_active: number;
  score: number;
  providers_json: string;
}

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  tokens_used: number;
  dollars_spent: number;
  providers_active: number;
  score: number;
}

export interface ModelUsageSnapshotRow {
  id: number;
  handle: string;
  provider_id: string;
  model_id: string;
  model_name: string | null;
  recorded_at: string;
  tokens_in: number | null;
  tokens_out: number | null;
  tokens_total: number;
  dollars_spent: number;
  raw_json: string;
}

export interface ModelUsageValue {
  provider_id: string;
  model_id: string;
  model_name: string | null;
  tokens_total: number;
  tokens_in: number | null;
  tokens_out: number | null;
  dollars_spent: number;
}

export interface UserUsage {
  handle: string;
  tokens_total: number;
  tokens_in: number | null;
  tokens_out: number | null;
  dollars_spent: number;
  providers_active: number;
  score: number;
  models: Record<string, ModelUsageValue>;
}

export interface ModelLeaderboardData {
  modelKey: string;
  provider_id: string;
  model_id: string;
  model_name: string | null;
  tokens_total: number;
  dollars_spent: number;
  users: number;
  topHandle: string | null;
  topTokens: number;
}

// ─── Hacknights ──────────────────────────────────────────────────────────────

export async function upsertHacknight(
  db: D1Database,
  row: Omit<HacknightRow, "id">,
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO hacknights (number, title, is_special, starts_at, ends_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(number) DO UPDATE SET
        title      = excluded.title,
        is_special = excluded.is_special,
        starts_at  = excluded.starts_at,
        ends_at    = excluded.ends_at
    `)
    .bind(row.number, row.title, row.is_special, row.starts_at, row.ends_at)
    .run();
}

export async function getHacknightByNumber(
  db: D1Database,
  number: number,
): Promise<HacknightRow | null> {
  return db.prepare("SELECT * FROM hacknights WHERE number = ?").bind(number).first<HacknightRow>();
}

/**
 * Find a hacknight whose window contains the given ISO timestamp.
 */
export async function getHacknightForTime(
  db: D1Database,
  isoTime: string,
): Promise<HacknightRow | null> {
  return db
    .prepare("SELECT * FROM hacknights WHERE starts_at <= ? AND ends_at > ? LIMIT 1")
    .bind(isoTime, isoTime)
    .first<HacknightRow>();
}

/** Upcoming published sessions, soonest first. */
export async function getUpcomingHacknights(
  db: D1Database,
  isoTime: string,
  limit = 5,
): Promise<HacknightRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM hacknights WHERE starts_at > ? ORDER BY starts_at ASC LIMIT ?")
    .bind(isoTime, limit)
    .all<HacknightRow>();
  return results;
}

export async function listHacknights(db: D1Database): Promise<HacknightRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM hacknights ORDER BY number DESC")
    .all<HacknightRow>();
  return results;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function upsertReport(db: D1Database, row: Omit<ReportRow, "id">): Promise<void> {
  await db
    .prepare(`
      INSERT INTO reports
        (handle, submitted_at, window_type, hacknight_id, window_key,
         tokens_used, dollars_spent, providers_active, score, providers_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(handle, window_key) DO UPDATE SET
        submitted_at     = excluded.submitted_at,
        tokens_used      = excluded.tokens_used,
        dollars_spent    = excluded.dollars_spent,
        providers_active = excluded.providers_active,
        score            = excluded.score,
        providers_json   = excluded.providers_json
    `)
    .bind(
      row.handle,
      row.submitted_at,
      row.window_type,
      row.hacknight_id,
      row.window_key,
      row.tokens_used,
      row.dollars_spent,
      row.providers_active,
      row.score,
      row.providers_json,
    )
    .run();
}

export async function insertModelUsageSnapshot(
  db: D1Database,
  row: Omit<ModelUsageSnapshotRow, "id">,
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO model_usage_snapshots
        (handle, provider_id, model_id, model_name, recorded_at,
         tokens_in, tokens_out, tokens_total, dollars_spent, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(handle, provider_id, model_id, recorded_at) DO UPDATE SET
        model_name     = excluded.model_name,
        tokens_in      = excluded.tokens_in,
        tokens_out     = excluded.tokens_out,
        tokens_total   = excluded.tokens_total,
        dollars_spent  = excluded.dollars_spent,
        raw_json       = excluded.raw_json
    `)
    .bind(
      row.handle,
      row.provider_id,
      row.model_id,
      row.model_name,
      row.recorded_at,
      row.tokens_in,
      row.tokens_out,
      row.tokens_total,
      row.dollars_spent,
      row.raw_json,
    )
    .run();
}

function modelKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

async function fetchBoundarySnapshots(
  db: D1Database,
  hacknight: HacknightRow,
): Promise<Map<string, ModelUsageSnapshotRow>> {
  const out = new Map<string, ModelUsageSnapshotRow>();

  const addRows = (rows: ModelUsageSnapshotRow[], boundary: string) => {
    for (const r of rows) {
      const key = `${r.handle}:${modelKey(r.provider_id, r.model_id)}:${boundary}`;
      out.set(key, r);
    }
  };

  const before = await db
    .prepare(`
      SELECT s.* FROM model_usage_snapshots s
      JOIN (
        SELECT handle, provider_id, model_id, MAX(recorded_at) AS recorded_at
        FROM model_usage_snapshots
        WHERE recorded_at <= ?
        GROUP BY handle, provider_id, model_id
      ) t
        ON s.handle = t.handle
       AND s.provider_id = t.provider_id
       AND s.model_id = t.model_id
       AND s.recorded_at = t.recorded_at
    `)
    .bind(hacknight.starts_at)
    .all<ModelUsageSnapshotRow>();
  addRows(before.results, "before");

  const first = await db
    .prepare(`
      SELECT s.* FROM model_usage_snapshots s
      JOIN (
        SELECT handle, provider_id, model_id, MIN(recorded_at) AS recorded_at
        FROM model_usage_snapshots
        WHERE recorded_at >= ? AND recorded_at < ?
        GROUP BY handle, provider_id, model_id
      ) t
        ON s.handle = t.handle
       AND s.provider_id = t.provider_id
       AND s.model_id = t.model_id
       AND s.recorded_at = t.recorded_at
    `)
    .bind(hacknight.starts_at, hacknight.ends_at)
    .all<ModelUsageSnapshotRow>();
  addRows(first.results, "first");

  const current = await db
    .prepare(`
      SELECT s.* FROM model_usage_snapshots s
      JOIN (
        SELECT handle, provider_id, model_id, MAX(recorded_at) AS recorded_at
        FROM model_usage_snapshots
        WHERE recorded_at >= ? AND recorded_at < ?
        GROUP BY handle, provider_id, model_id
      ) t
        ON s.handle = t.handle
       AND s.provider_id = t.provider_id
       AND s.model_id = t.model_id
       AND s.recorded_at = t.recorded_at
    `)
    .bind(hacknight.starts_at, hacknight.ends_at)
    .all<ModelUsageSnapshotRow>();
  addRows(current.results, "current");

  return out;
}

function delta(a: number, b: number): number {
  return Math.max(0, a - b);
}

export interface HacknightUsage {
  byHandle: Record<string, UserUsage>;
  byModel: Record<string, ModelLeaderboardData>;
}

export async function getHacknightUsage(
  db: D1Database,
  hacknight: HacknightRow,
): Promise<HacknightUsage> {
  const boundaries = await fetchBoundarySnapshots(db, hacknight);

  const byHandle: Record<string, UserUsage> = {};
  const byModel: Record<string, ModelLeaderboardData> = {};

  // Collect the set of (handle, provider, model) combos that had any snapshot
  // during the hack night window (we only need current rows to seed grouping).
  const seen = new Set<string>();
  for (const [boundaryKey, row] of boundaries) {
    if (!boundaryKey.endsWith(":current")) continue;
    const combo = `${row.handle}:${modelKey(row.provider_id, row.model_id)}`;
    if (seen.has(combo)) continue;
    seen.add(combo);

    const key = modelKey(row.provider_id, row.model_id);

    const currentRow = boundaries.get(`${row.handle}:${key}:current`) ?? row;
    const beforeRow = boundaries.get(`${row.handle}:${key}:before`);
    const firstRow = boundaries.get(`${row.handle}:${key}:first`);
    const baselineRow = beforeRow ?? firstRow ?? currentRow;

    const tokensDelta = delta(currentRow.tokens_total, baselineRow.tokens_total);
    if (tokensDelta === 0 && delta(currentRow.dollars_spent, baselineRow.dollars_spent) === 0) {
      // Still include the model so the UI can show zero usage, but don't inflate
      // user totals beyond what they actually reported.
    }

    const modelValue: ModelUsageValue = {
      provider_id: currentRow.provider_id,
      model_id: currentRow.model_id,
      model_name: currentRow.model_name,
      tokens_total: tokensDelta,
      tokens_in:
        currentRow.tokens_in != null && baselineRow.tokens_in != null
          ? delta(currentRow.tokens_in, baselineRow.tokens_in)
          : null,
      tokens_out:
        currentRow.tokens_out != null && baselineRow.tokens_out != null
          ? delta(currentRow.tokens_out, baselineRow.tokens_out)
          : null,
      dollars_spent: delta(currentRow.dollars_spent, baselineRow.dollars_spent),
    };

    // Aggregate per user
    let user = byHandle[row.handle];
    if (!user) {
      user = {
        handle: row.handle,
        tokens_total: 0,
        tokens_in: 0,
        tokens_out: 0,
        dollars_spent: 0,
        providers_active: 0,
        score: 0,
        models: {},
      };
      byHandle[row.handle] = user;
    }
    user.models[key] = modelValue;
    user.tokens_total += tokensDelta;
    if (modelValue.tokens_in != null) {
      user.tokens_in = (user.tokens_in ?? 0) + modelValue.tokens_in;
    }
    if (modelValue.tokens_out != null) {
      user.tokens_out = (user.tokens_out ?? 0) + modelValue.tokens_out;
    }
    user.dollars_spent += modelValue.dollars_spent;

    // Aggregate per model across all users
    let modelAgg = byModel[key];
    if (!modelAgg) {
      modelAgg = {
        modelKey: key,
        provider_id: currentRow.provider_id,
        model_id: currentRow.model_id,
        model_name: currentRow.model_name,
        tokens_total: 0,
        dollars_spent: 0,
        users: 0,
        topHandle: null,
        topTokens: 0,
      };
      byModel[key] = modelAgg;
    }
    modelAgg.tokens_total += tokensDelta;
    modelAgg.dollars_spent += modelValue.dollars_spent;
    modelAgg.users += 1;
    if (tokensDelta > modelAgg.topTokens) {
      modelAgg.topTokens = tokensDelta;
      modelAgg.topHandle = row.handle;
    }
  }

  // Compute provider_active and score for each user after aggregation.
  for (const user of Object.values(byHandle)) {
    const activeProviders = new Set<string>();
    for (const m of Object.values(user.models)) {
      if (m.tokens_total > 0 || m.dollars_spent > 0) {
        activeProviders.add(m.provider_id);
      }
    }
    user.providers_active = activeProviders.size;
    user.score = user.dollars_spent * 100 + user.tokens_total / 1_000_000;
  }

  return { byHandle, byModel };
}

export interface HacknightWinnerRow {
  id: number;
  hacknight_id: number;
  category: string;
  metric: string;
  handle: string;
  value: number;
  computed_at: string;
}

export async function recordHacknightWinner(
  db: D1Database,
  row: Omit<HacknightWinnerRow, "id">,
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO hacknight_winners (hacknight_id, category, metric, handle, value, computed_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(hacknight_id, category, metric) DO UPDATE SET
        handle      = excluded.handle,
        value       = excluded.value,
        computed_at = excluded.computed_at
    `)
    .bind(row.hacknight_id, row.category, row.metric, row.handle, row.value, row.computed_at)
    .run();
}

export async function getHacknightWinners(
  db: D1Database,
  hacknightId: number,
): Promise<HacknightWinnerRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM hacknight_winners WHERE hacknight_id = ? ORDER BY category, metric")
    .bind(hacknightId)
    .all<HacknightWinnerRow>();
  return results;
}

export async function hasHacknightWinners(db: D1Database, hacknightId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS present FROM hacknight_winners WHERE hacknight_id = ? LIMIT 1")
    .bind(hacknightId)
    .first<{ present: number }>();
  return row?.present === 1;
}

export type LeaderboardMetric = "tokens" | "dollars" | "providers" | "score";

const METRIC_COL: Record<LeaderboardMetric, string> = {
  tokens: "tokens_used",
  dollars: "dollars_spent",
  providers: "providers_active",
  score: "score",
};

// ─── Sync state ──────────────────────────────────────────────────────────────

export interface SyncStateRow {
  last_attempt_at: string | null;
  last_ok_at: string | null;
  last_count: number | null;
  last_error: string | null;
}

/** Record a successful Luma sync (clears any prior error). */
export async function recordSyncSuccess(db: D1Database, count: number, at: string): Promise<void> {
  await db
    .prepare(`
      INSERT INTO sync_state (id, last_attempt_at, last_ok_at, last_count, last_error)
      VALUES (1, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        last_attempt_at = excluded.last_attempt_at,
        last_ok_at      = excluded.last_ok_at,
        last_count      = excluded.last_count,
        last_error      = NULL
    `)
    .bind(at, at, count)
    .run();
}

/** Record a failed Luma sync, preserving the last successful sync info. */
export async function recordSyncFailure(
  db: D1Database,
  message: string,
  at: string,
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO sync_state (id, last_attempt_at, last_ok_at, last_count, last_error)
      VALUES (1, ?, NULL, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_attempt_at = excluded.last_attempt_at,
        last_error      = excluded.last_error
    `)
    .bind(at, message.slice(0, 500))
    .run();
}

export async function getSyncState(db: D1Database): Promise<SyncStateRow | null> {
  return db.prepare("SELECT * FROM sync_state WHERE id = 1").first<SyncStateRow>();
}

export async function getLeaderboard(
  db: D1Database,
  windowKey: string,
  metric: LeaderboardMetric = "tokens",
  limit = 50,
): Promise<LeaderboardEntry[]> {
  const col = METRIC_COL[metric];
  const { results } = await db
    .prepare(`
      SELECT
        ROW_NUMBER() OVER (ORDER BY ${col} DESC) AS rank,
        handle,
        tokens_used,
        dollars_spent,
        providers_active,
        score
      FROM reports
      WHERE window_key = ?
      ORDER BY ${col} DESC
      LIMIT ?
    `)
    .bind(windowKey, limit)
    .all<LeaderboardEntry>();
  return results;
}
