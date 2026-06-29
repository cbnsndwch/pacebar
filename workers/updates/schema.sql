-- PaceBar update-check log (D1).
-- The desktop updater polls its channel feed about every 15 min. This worker
-- proxies that poll and records it here as a per-DAY rollup, so the table stays
-- small and doubles as an adoption-over-time signal. Anonymous: no install id,
-- no account, no PII — just which build is still polling, plus a coarse country.

CREATE TABLE IF NOT EXISTS update_checks (
  day         TEXT NOT NULL,            -- UTC date of the poll, YYYY-MM-DD
  channel     TEXT NOT NULL,            -- stable | rc
  target      TEXT NOT NULL,            -- linux | windows | darwin
  arch        TEXT NOT NULL,            -- x86_64 | aarch64 | i686 | armv7
  app_version TEXT NOT NULL,            -- version of the polling app
  country     TEXT NOT NULL DEFAULT '', -- coarse country (Cloudflare geo), '' if unknown
  hits        INTEGER NOT NULL,         -- polls counted in this bucket
  PRIMARY KEY (day, channel, target, arch, app_version, country)
);
