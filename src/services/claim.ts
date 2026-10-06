/**
 * Dispatch claims — the in-flight guard.
 *
 * Ported from app/services/claim.py and app/storage/dispatch/__init__.py.
 *
 * A claim is taken before the Discord call and the chapter is recorded in
 * dispatch_history after. The claim stops two concurrent ticks from sending
 * the same chapter; dispatch_history is the permanent ledger.
 *
 * THE EXPIRY IS LOAD-BEARING. The read filters on `expires_at > now`, so the
 * write must too. The original Python used ON CONFLICT DO NOTHING, which meant
 * an expired claim (a send that was parked while the row was held) blocked the
 * re-claim forever — the chapter was never sent and the row sat there. The
 * ON CONFLICT below only yields when the existing claim has actually expired.
 */
import { CLAIM_TTL_MS, type Env } from "../config";
import { getLogger } from "../logger";
import { fcfsKey, nowIso } from "../utils/text";

const logger = getLogger("services:claim");

export interface ClaimInput {
  titleKey: string;
  title: string;
  chapter: string;
  source: string;
  channelId: string;
}

export interface ClaimResult {
  claimed: string[];
  skipped: number;
}

/**
 * Atomically claim a set of chapters for one channel.
 *
 * Returns the fcfs_keys actually claimed. Keys already held by a LIVE claim
 * are skipped; keys whose claim has expired are taken over.
 */
export async function claimForDispatch(
  env: Env,
  items: ClaimInput[],
  channelId: string,
): Promise<ClaimResult> {
  if (items.length === 0) return { claimed: [], skipped: 0 };

  const now = nowIso();
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS).toISOString();
  const claimed: string[] = [];
  let skipped = 0;

  const stmt = env.DB.prepare(
    `INSERT INTO dispatch_claims (fcfs_key, title_key, source, chapter, channel_id, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT (fcfs_key) DO UPDATE SET
       title_key  = excluded.title_key,
       source     = excluded.source,
       chapter    = excluded.chapter,
       channel_id = excluded.channel_id,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at
     WHERE dispatch_claims.expires_at < excluded.created_at
     RETURNING fcfs_key`,
  );

  for (const it of items) {
    const key = fcfsKey(it.title, it.chapter);
    if (!key) continue;
    try {
      const res = await stmt
        .bind(key, it.titleKey, it.source, it.chapter, channelId, now, expiresAt)
        .all<{ fcfs_key: string }>();
      if (res.results && res.results.length > 0) {
        claimed.push(key);
      } else {
        // No row returned => a live claim already held this key.
        skipped++;
      }
    } catch (err) {
      logger.warn("claim failed", { key, err: String(err).slice(0, 160) });
      skipped++;
    }
  }

  return { claimed, skipped };
}

/** Release claims after a send completes (success or recorded failure). */
export async function releaseClaims(env: Env, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const stmt = env.DB.prepare(`DELETE FROM dispatch_claims WHERE fcfs_key = ?1`);
  await env.DB.batch(keys.map((k) => stmt.bind(k)));
}

/**
 * Release claims older than the TTL that were never completed.
 *
 * A crash between claim and release would otherwise hold the chapter until the
 * expiry passes; this makes the recovery immediate instead of eventual.
 */
export async function unclaimStale(env: Env): Promise<number> {
  const res = await env.DB.prepare(`DELETE FROM dispatch_claims WHERE expires_at < ?1`)
    .bind(nowIso())
    .run();
  const n = res.meta?.changes ?? 0;
  if (n) logger.info("unclaim_stale released", { count: n });
  return n;
}

/** True when the key is already in the permanent ledger. */
export async function alreadyDispatched(env: Env, keys: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (keys.length === 0) return out;
  const CHUNK = 100;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, n) => `?${n + 1}`).join(",");
    const res = await env.DB.prepare(
      `SELECT fcfs_key FROM dispatch_history WHERE fcfs_key IN (${placeholders})`,
    )
      .bind(...chunk)
      .all<{ fcfs_key: string }>();
    for (const r of res.results ?? []) if (r.fcfs_key) out.add(r.fcfs_key);
  }
  return out;
}

export interface HistoryInput {
  chapterUrl: string;
  titleKey: string;
  source: string;
  chapterTitle: string;
  cover: string | null;
  seriesUrl: string | null;
}

/** Record a successful send. Idempotent on fcfs_key. */
export async function recordDispatchHistory(
  env: Env,
  rows: HistoryInput[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const now = nowIso();
  const stmt = env.DB.prepare(
    `INSERT INTO dispatch_history
       (chapter_url, title_key, source, chapter_title, cover, series_url, fcfs_key, sent_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
     ON CONFLICT (fcfs_key) DO NOTHING`,
  );
  const bound = rows.map((r) =>
    stmt.bind(
      r.chapterUrl,
      r.titleKey,
      r.source,
      r.chapterTitle,
      r.cover,
      r.seriesUrl,
      fcfsKey(r.titleKey.replace(/-/g, " "), r.chapterTitle),
      now,
    ),
  );
  let written = 0;
  const CHUNK = 50;
  for (let i = 0; i < bound.length; i += CHUNK) {
    const chunk = bound.slice(i, i + CHUNK);
    try {
      await env.DB.batch(chunk);
      written += chunk.length;
    } catch (err) {
      logger.error("dispatch_history write failed", { err: String(err).slice(0, 200) });
    }
  }
  return written;
}

/** Park a failed send for retry. Upsert so a repeat failure updates the row. */
export async function parkFailedDispatch(
  env: Env,
  row: HistoryInput & { errorCode: string; errorMessage: string },
): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO failed_dispatches
       (chapter_url, title_key, source, chapter_title, error_code, error_message,
        retry_count, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 'failed', ?7, ?7)
     ON CONFLICT (chapter_url) DO UPDATE SET
       error_code    = excluded.error_code,
       error_message = excluded.error_message,
       status        = 'failed',
       updated_at    = excluded.updated_at`,
  )
    .bind(
      row.chapterUrl,
      row.titleKey,
      row.source,
      row.chapterTitle,
      row.errorCode,
      row.errorMessage.slice(0, 500),
      now,
    )
    .run();
}

/** Mark a parked send as resolved (retried successfully, or no longer wanted). */
export async function resolveFailedDispatch(
  env: Env,
  chapterUrl: string,
  reason: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE failed_dispatches
        SET status = 'resolved', updated_at = ?1, error_message = ?2
      WHERE chapter_url = ?3`,
  )
    .bind(nowIso(), reason.slice(0, 500), chapterUrl)
    .run();
}
