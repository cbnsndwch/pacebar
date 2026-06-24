-- PaceBar Leaderboard D1 Schema

CREATE TABLE IF NOT EXISTS hacknights (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  number     INTEGER NOT NULL,
  title      TEXT    NOT NULL,
  is_special INTEGER NOT NULL DEFAULT 0,
  starts_at  TEXT    NOT NULL,
  ends_at    TEXT    NOT NULL,
  UNIQUE(number)
);

CREATE TABLE IF NOT EXISTS reports (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  handle           TEXT    NOT NULL,
  submitted_at     TEXT    NOT NULL,
  window_type      TEXT    NOT NULL CHECK(window_type IN ('hacknight','daily','weekly','monthly')),
  hacknight_id     INTEGER REFERENCES hacknights(id),
  window_key       TEXT    NOT NULL,
  tokens_used      INTEGER NOT NULL DEFAULT 0,
  dollars_spent    REAL    NOT NULL DEFAULT 0,
  providers_active INTEGER NOT NULL DEFAULT 0,
  score            REAL    NOT NULL DEFAULT 0,
  providers_json   TEXT    NOT NULL DEFAULT '[]',
  UNIQUE(handle, window_key) ON CONFLICT REPLACE
);

CREATE INDEX IF NOT EXISTS idx_reports_window_key  ON reports(window_key);
CREATE INDEX IF NOT EXISTS idx_reports_handle      ON reports(handle);
CREATE INDEX IF NOT EXISTS idx_reports_hacknight   ON reports(hacknight_id);

-- Per-model usage snapshots reported by clients. These are point-in-time
-- cumulative counters; deltas are computed at query time.
CREATE TABLE IF NOT EXISTS model_usage_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  handle        TEXT    NOT NULL,
  provider_id   TEXT    NOT NULL,
  model_id      TEXT    NOT NULL,
  model_name    TEXT,
  recorded_at   TEXT    NOT NULL,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  tokens_total  INTEGER NOT NULL DEFAULT 0,
  dollars_spent REAL    NOT NULL DEFAULT 0,
  raw_json      TEXT    NOT NULL DEFAULT '{}',
  UNIQUE(handle, provider_id, model_id, recorded_at) ON CONFLICT REPLACE
);

CREATE INDEX IF NOT EXISTS idx_model_usage_handle         ON model_usage_snapshots(handle);
CREATE INDEX IF NOT EXISTS idx_model_usage_provider_model ON model_usage_snapshots(provider_id, model_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_recorded_at    ON model_usage_snapshots(recorded_at);
CREATE INDEX IF NOT EXISTS idx_model_usage_lookup         ON model_usage_snapshots(handle, provider_id, model_id, recorded_at);

-- Archived hacknight winners (overall metrics + per-model tokens).
CREATE TABLE IF NOT EXISTS hacknight_winners (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  hacknight_id  INTEGER NOT NULL REFERENCES hacknights(id),
  category      TEXT    NOT NULL, -- 'overall' | 'model'
  metric        TEXT    NOT NULL, -- 'tokens' | 'dollars' | 'providers' | 'score' | model key
  handle        TEXT    NOT NULL,
  value         REAL    NOT NULL,
  computed_at   TEXT    NOT NULL,
  UNIQUE(hacknight_id, category, metric) ON CONFLICT REPLACE
);

CREATE INDEX IF NOT EXISTS idx_hacknight_winners_hacknight ON hacknight_winners(hacknight_id);

-- Single-row record of the most recent Luma calendar sync (cron health).
CREATE TABLE IF NOT EXISTS sync_state (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  last_attempt_at TEXT,
  last_ok_at      TEXT,
  last_count      INTEGER,
  last_error      TEXT
);
