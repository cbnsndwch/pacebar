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

-- Single-row record of the most recent Luma calendar sync (cron health).
CREATE TABLE IF NOT EXISTS sync_state (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  last_attempt_at TEXT,
  last_ok_at      TEXT,
  last_count      INTEGER,
  last_error      TEXT
);
