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
