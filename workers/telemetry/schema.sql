-- PaceBar anonymous telemetry D1 schema.
-- One row per anonymous install id. No account, no PII — just enough to see
-- which app versions / OSes are actively in use.

CREATE TABLE IF NOT EXISTS installs (
  id          TEXT PRIMARY KEY,   -- random anonymous id (UUID v4) from the client
  first_seen  TEXT NOT NULL,      -- ISO timestamp of first ping
  last_seen   TEXT NOT NULL,      -- ISO timestamp of most recent ping
  app_version TEXT NOT NULL,
  os          TEXT NOT NULL,      -- macos | windows | linux
  arch        TEXT NOT NULL,      -- x86_64 | aarch64
  country     TEXT                -- coarse country code (Cloudflare geo), optional
);

CREATE INDEX IF NOT EXISTS idx_installs_last_seen ON installs(last_seen);
CREATE INDEX IF NOT EXISTS idx_installs_version   ON installs(app_version);
