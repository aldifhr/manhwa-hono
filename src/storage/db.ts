/**
 * D1 storage helpers.
 *
 * The Python backend talked to Postgres through psycopg with a connection
 * pool. D1 is request-scoped and SQLite-dialect, so the shape changes but the
 * queries are the same logic. All timestamps are ISO-8601 UTC strings.
 */
import type { Env } from "../config";
import { getLogger } from "../logger";
import { nowIso } from "../utils/text";

const logger = getLogger("storage");

export interface WhitelistRow {
  id: string;
  title_key: string;
  title: string | null;
  source: string;
  series_url: string | null;
  url: string | null;
  latest_sent_chapter: number | null;
  latest_chapter: number | null;
  created_at: string;
  updated_at: string | null;
}

export interface ChapterRow {
  id: number;
  chapter_url: string;
  title_key: string;
  title: string | null;
  chapter: string | null;
  source: string | null;
  cover: string | null;
  series_url: string | null;
  chapter_num: number | null;
  origin: string | null;
  description: string | null;
  type: string | null;
  status: string;
  rating: number | null;
  genres: string;
  release_date: string | null;
  updated_time: string | null;
  created_at: string;
}

/** Load every whitelist row. Cross-source matching is done by the caller. */
export async function loadWhitelist(env: Env): Promise<WhitelistRow[]> {
  const res = await env.DB.prepare(
    `SELECT id, title_key, title, source, series_url, url,
            latest_sent_chapter, latest_chapter, created_at, updated_at
       FROM whitelist`,
  ).all<WhitelistRow>();
  return res.results ?? [];
}

export interface WhitelistInput {
  title_key: string;
  title?: string | null;
  source: string;
  series_url?: string | null;
  url?: string | null;
}

/** Insert or update a whitelist entry, keyed on (title_key, source). */
export async function upsertWhitelist(env: Env, row: WhitelistInput): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO whitelist (id, title_key, title, source, series_url, url, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
     ON CONFLICT (title_key, source) DO UPDATE SET
       title      = COALESCE(excluded.title, whitelist.title),
       series_url = COALESCE(excluded.series_url, whitelist.series_url),
       url        = COALESCE(excluded.url, whitelist.url),
       updated_at = excluded.updated_at`,
  )
    .bind(
      crypto.randomUUID(),
      row.title_key,
      row.title ?? null,
      row.source,
      row.series_url ?? null,
      row.url ?? null,
      now,
    )
    .run();
}

export async function deleteWhitelist(env: Env, titleKey: string, source: string): Promise<number> {
  const res = await env.DB.prepare(
    `DELETE FROM whitelist WHERE title_key = ?1 AND source = ?2`,
  )
    .bind(titleKey, source)
    .run();
  return res.meta?.changes ?? 0;
}

/** (title_key, source) pairs the operator silenced. */
export async function loadExcludedKeys(env: Env): Promise<Set<string>> {
  const res = await env.DB.prepare(`SELECT title_key, source FROM excluded_titles`).all<{
    title_key: string;
    source: string;
  }>();
  const out = new Set<string>();
  for (const r of res.results ?? []) out.add(`${r.title_key}|${r.source}`);
  return out;
}

export interface InsertStats {
  inserted: number;
  updated: number;
  failed: number;
}

/**
 * Upsert scraped chapters.
 *
 * chapter_url is the natural key, so a re-scrape refreshes metadata instead of
 * duplicating. status/created_at are only set on first insert — a later scrape
 * must not reset a row that has already been dispatched.
 */
export async function batchInsertChapters(
  env: Env,
  items: Array<Record<string, unknown>>,
): Promise<InsertStats> {
  if (items.length === 0) return { inserted: 0, updated: 0, failed: 0 };

  const now = nowIso();
  const stmt = env.DB.prepare(
    `INSERT INTO recent_chapters (
       chapter_url, title_key, title, chapter, source, cover, series_url,
       chapter_num, origin, description, type, status, rating, genres,
       release_date, updated_time, created_at
     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'pending',?12,?13,?14,?15,?16)
     ON CONFLICT (chapter_url) DO UPDATE SET
       title        = COALESCE(excluded.title, recent_chapters.title),
       cover        = COALESCE(excluded.cover, recent_chapters.cover),
       series_url   = COALESCE(excluded.series_url, recent_chapters.series_url),
       description  = COALESCE(excluded.description, recent_chapters.description),
       rating       = COALESCE(excluded.rating, recent_chapters.rating),
       genres       = COALESCE(excluded.genres, recent_chapters.genres),
       origin       = COALESCE(excluded.origin, recent_chapters.origin),
       release_date = COALESCE(excluded.release_date, recent_chapters.release_date),
       updated_time = COALESCE(excluded.updated_time, recent_chapters.updated_time)`,
  );

  const bound = items
    .filter((it) => it.chapter_url)
    .map((it) =>
      stmt.bind(
        String(it.chapter_url),
        String(it.title_key ?? ""),
        (it.title as string) ?? null,
        (it.chapter as string) ?? null,
        (it.source as string) ?? null,
        (it.cover as string) ?? null,
        (it.series_url as string) ?? null,
        it.chapter_num === null || it.chapter_num === undefined ? null : Number(it.chapter_num),
        (it.origin as string) ?? null,
        (it.description as string) ?? null,
        (it.type as string) ?? null,
        it.rating === null || it.rating === undefined ? null : Number(it.rating),
        JSON.stringify(it.genres ?? []),
        (it.release_date as string) ?? null,
        (it.updated_time as string) ?? null,
        now,
      ),
    );

  if (bound.length === 0) return { inserted: 0, updated: 0, failed: 0 };

  let failed = 0;
  // D1 caps a batch; chunk so one oversized scrape cannot fail wholesale.
  const CHUNK = 50;
  for (let i = 0; i < bound.length; i += CHUNK) {
    const chunk = bound.slice(i, i + CHUNK);
    try {
      await env.DB.batch(chunk);
    } catch (err) {
      failed += chunk.length;
      logger.error("batch insert chunk failed", { size: chunk.length, err: String(err).slice(0, 200) });
    }
  }
  // D1 batch() does not report per-row insert-vs-update, so the split is
  // approximate: anything not previously present counts as inserted.
  return { inserted: bound.length - failed, updated: 0, failed };
}

/** Chapters inside the freshness window, newest first. */
export async function getRecentChapters(env: Env, hours = 24): Promise<ChapterRow[]> {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const res = await env.DB.prepare(
    `SELECT * FROM recent_chapters
      WHERE COALESCE(release_date, updated_time, created_at) >= ?1
      ORDER BY COALESCE(release_date, updated_time, created_at) DESC`,
  )
    .bind(cutoff)
    .all<ChapterRow>();
  return res.results ?? [];
}

export interface CronStatus {
  status: string;
  chapters_sent?: number;
  matched?: number;
  duration_s?: number;
}

export async function writeCronStatus(env: Env, s: CronStatus): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO cron_run_status (status, chapters_sent, matched, duration_s, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(s.status, s.chapters_sent ?? 0, s.matched ?? 0, s.duration_s ?? 0, nowIso())
    .run();
}

export interface SourceHealth {
  source: string;
  status: string;
  response_time_ms: number;
  successes_today: number;
  failures_today: number;
  consecutive_failures: number;
  last_error: string | null;
  last_success_at: string | null;
  last_checked_at: string;
}

/** The subset saveSourceHealthMap needs; the source name is the map key. */
export type SourceHealthInput = Omit<SourceHealth, "source">;

export async function saveSourceHealthMap(
  env: Env,
  map: Record<string, SourceHealthInput>,
): Promise<void> {
  const entries = Object.entries(map);
  if (entries.length === 0) return;
  const stmt = env.DB.prepare(
    `INSERT INTO source_health (
       source, status, response_time_ms, successes_today, failures_today,
       consecutive_failures, last_error, last_success_at, last_checked_at, updated_at
     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)
     ON CONFLICT (source) DO UPDATE SET
       status               = excluded.status,
       response_time_ms     = excluded.response_time_ms,
       successes_today      = excluded.successes_today,
       failures_today       = excluded.failures_today,
       consecutive_failures = excluded.consecutive_failures,
       last_error           = excluded.last_error,
       last_success_at      = COALESCE(excluded.last_success_at, source_health.last_success_at),
       last_checked_at      = excluded.last_checked_at,
       updated_at           = excluded.updated_at`,
  );
  await env.DB.batch(
    entries.map(([src, h]) =>
      stmt.bind(
        src,
        h.status,
        h.response_time_ms,
        h.successes_today,
        h.failures_today,
        h.consecutive_failures,
        h.last_error,
        h.last_success_at,
        h.last_checked_at,
      ),
    ),
  );
}

export async function loadSourceHealthMap(
  env: Env,
  sources: string[],
): Promise<Record<string, { disabled_until?: string | null; consecutive_failures?: number }>> {
  if (sources.length === 0) return {};
  const placeholders = sources.map((_, i) => `?${i + 1}`).join(",");
  const res = await env.DB.prepare(
    `SELECT source, disabled_until, consecutive_failures FROM source_health WHERE source IN (${placeholders})`,
  )
    .bind(...sources)
    .all<{ source: string; disabled_until: string | null; consecutive_failures: number | null }>();
  const out: Record<string, { disabled_until?: string | null; consecutive_failures?: number }> = {};
  for (const r of res.results ?? []) {
    out[r.source] = {
      disabled_until: r.disabled_until,
      consecutive_failures: r.consecutive_failures ?? 0,
    };
  }
  return out;
}

// ── cron_state: small values that must survive between ticks ─────────────────

/**
 * Read the rotating walk cursor.
 *
 * The shinigami whitelist walk cannot cover every series in one tick (the free
 * plan caps an invocation at 50 subrequests), so it takes a bounded slice and
 * stores where it stopped. A missing or unparsable value restarts from 0 — the
 * walk is idempotent, so a reset costs a repeat pass, never a lost chapter.
 */
export async function loadWalkCursor(env: Env): Promise<number> {
  try {
    const row = await env.DB.prepare(`SELECT value FROM cron_state WHERE key = 'shinigami_walk_cursor'`)
      .first<{ value: string }>();
    const n = Number.parseInt(row?.value ?? "0", 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function saveWalkCursor(env: Env, cursor: number): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO cron_state (key, value, updated_at) VALUES ('shinigami_walk_cursor', ?1, ?2)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
      .bind(String(Math.max(0, Math.floor(cursor))), nowIso())
      .run();
  } catch (err) {
    // A cursor write failure only costs a repeated slice; never fail the tick.
    logger.warn("walk cursor save failed", { err: String(err).slice(0, 120) });
  }
}
