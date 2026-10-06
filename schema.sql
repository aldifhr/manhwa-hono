-- manhwa-hono schema (D1 / SQLite dialect).
--
-- Ported from the Postgres schema in manhwa-scanner/apps/backend. Table and
-- column names are kept identical so a dump/restore maps 1:1, with these
-- deliberate dialect changes:
--
--   * timestamptz  -> TEXT (ISO-8601 UTC, e.g. 2026-10-06T16:03:18.585Z)
--     SQLite has no date type; storing ISO strings sorts lexicographically
--     and compares correctly, and datetime() can parse them.
--   * uuid         -> TEXT (generated in app code via crypto.randomUUID)
--   * jsonb        -> TEXT holding a JSON array (D1 has json_* functions)
--   * bigserial    -> INTEGER PRIMARY KEY AUTOINCREMENT
--   * numeric      -> REAL
--
-- The unique indexes matter as much as the tables: dispatch_claims.fcfs_key
-- and whitelist (title_key, source) are what make the pipeline idempotent.

PRAGMA foreign_keys = ON;

-- ── whitelist ────────────────────────────────────────────────────────────────
-- One row per (series, source). A series carried by two sources is two rows,
-- which is what makes the badge per-source while dispatch stays cross-source.
CREATE TABLE IF NOT EXISTS whitelist (
  id                  TEXT PRIMARY KEY,
  title_key           TEXT NOT NULL,
  title               TEXT,
  source              TEXT NOT NULL,
  series_url          TEXT,
  url                 TEXT,
  latest_sent_chapter INTEGER,
  latest_chapter      REAL,
  metadata_enriched_at TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS whitelist_title_key_source_key
  ON whitelist (title_key, source);

CREATE INDEX IF NOT EXISTS whitelist_title_key_idx ON whitelist (title_key);

-- ── recent_chapters ──────────────────────────────────────────────────────────
-- chapter_url is the natural key: the same chapter never needs two rows, and
-- a re-scrape upserts rather than duplicating.
CREATE TABLE IF NOT EXISTS recent_chapters (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_url      TEXT NOT NULL UNIQUE,
  title_key        TEXT NOT NULL,
  title            TEXT,
  chapter          TEXT,
  source           TEXT,
  cover            TEXT,
  series_url       TEXT,
  chapter_num      REAL,
  origin           TEXT,
  description      TEXT,
  type             TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  rating           REAL,
  genres           TEXT NOT NULL DEFAULT '[]',
  release_date     TEXT,
  updated_time     TEXT,
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS recent_chapters_release_date_idx
  ON recent_chapters (release_date DESC);
CREATE INDEX IF NOT EXISTS recent_chapters_title_key_idx
  ON recent_chapters (title_key);
CREATE INDEX IF NOT EXISTS recent_chapters_source_idx
  ON recent_chapters (source);

-- ── dispatch_history ─────────────────────────────────────────────────────────
-- The ledger of what was actually sent. fcfs_key is UNIQUE, which is the
-- whole idempotency guarantee: a chapter cannot be announced twice even if
-- two sources report it in the same tick.
CREATE TABLE IF NOT EXISTS dispatch_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_url   TEXT NOT NULL,
  title_key     TEXT,
  source        TEXT,
  chapter_title TEXT,
  cover         TEXT,
  series_url    TEXT,
  fcfs_key      TEXT UNIQUE,
  sent_at       TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS dispatch_history_fcfs_key_idx
  ON dispatch_history (fcfs_key);

-- ── dispatch_claims ──────────────────────────────────────────────────────────
-- In-flight guard. A claim is taken before the Discord call and released
-- after, so a crash mid-send does not double-post on the next tick.
--
-- The expiry is load-bearing: claims are filtered by expires_at, so the
-- ON CONFLICT clause must also compare it. A claim that expired while a send
-- was parked has to be re-claimable, otherwise the chapter is never sent and
-- the row sits there forever. See services/claim.ts.
CREATE TABLE IF NOT EXISTS dispatch_claims (
  fcfs_key   TEXT PRIMARY KEY,
  title_key  TEXT,
  source     TEXT,
  chapter    TEXT,
  channel_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS dispatch_claims_expires_at_idx
  ON dispatch_claims (expires_at);

-- ── failed_dispatches ────────────────────────────────────────────────────────
-- Parked sends for retry. retry_count + updated_at drive the backoff.
--
-- A row here can OUTLIVE the whitelist entry that produced it (the user
-- unsubscribes while a send is parked), so the retry path MUST re-check the
-- whitelist before re-sending. See services/retry.ts.
CREATE TABLE IF NOT EXISTS failed_dispatches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_url   TEXT NOT NULL UNIQUE,
  title_key     TEXT,
  source        TEXT,
  chapter_title TEXT,
  error_code    TEXT,
  error_message TEXT,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'failed',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS failed_dispatches_status_idx
  ON failed_dispatches (status, updated_at);

-- ── source_health ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS source_health (
  source               TEXT PRIMARY KEY,
  status               TEXT,
  response_time_ms     INTEGER,
  successes_today      INTEGER DEFAULT 0,
  failures_today       INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  disabled_until       TEXT,
  last_error           TEXT,
  last_success_at      TEXT,
  last_checked_at      TEXT,
  created_at           TEXT,
  updated_at           TEXT
);

-- ── excluded_titles ──────────────────────────────────────────────────────────
-- (title_key, source) pairs the operator explicitly silenced.
CREATE TABLE IF NOT EXISTS excluded_titles (
  title_key  TEXT NOT NULL,
  source     TEXT NOT NULL,
  reason     TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (title_key, source)
);

-- ── cron_run_status ──────────────────────────────────────────────────────────
-- Single-row-ish telemetry so the dashboard can show the last run.
CREATE TABLE IF NOT EXISTS cron_run_status (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  status         TEXT,
  chapters_sent  INTEGER DEFAULT 0,
  matched        INTEGER DEFAULT 0,
  duration_s     REAL,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cron_run_status_created_at_idx
  ON cron_run_status (created_at DESC);

-- ── cron_state ───────────────────────────────────────────────────────────────
-- Small key/value scratch space for values that must survive between ticks.
-- Currently holds the rotating cursor for the shinigami whitelist walk: the
-- Workers free plan allows 50 subrequests per invocation, so the walk covers a
-- bounded slice per tick and resumes where it left off instead of trying (and
-- failing) to walk every series at once.
CREATE TABLE IF NOT EXISTS cron_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ── series_meta ──────────────────────────────────────────────────────────────
-- Enriched metadata cache, keyed by (title_key, source).
CREATE TABLE IF NOT EXISTS series_meta (
  title_key   TEXT NOT NULL,
  source      TEXT NOT NULL,
  cover       TEXT,
  rating      REAL,
  genres      TEXT DEFAULT '[]',
  description TEXT,
  author      TEXT,
  artist      TEXT,
  type        TEXT,
  origin      TEXT,
  series_url  TEXT,
  fetched_at  TEXT,
  PRIMARY KEY (title_key, source)
);
