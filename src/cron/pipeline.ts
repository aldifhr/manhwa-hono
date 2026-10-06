/**
 * The dual-pass pipeline.
 *
 * Ported from app/cron/pipeline.py.
 *
 *   fetch mode    (doDispatch=false): scrape -> filter fresh -> persist
 *   dispatch mode (doDispatch=true):  read recent_chapters -> whitelist -> send
 *
 * The split exists because the scrape is slow (ikiru ~2s, shinigami up to 24s)
 * while dispatch is fast, so they run on independent schedules and neither
 * blocks the other.
 */
import { freshWindowHours, type Env } from "../config";
import { getLogger } from "../logger";
import { collectRecentChapters, filterWhitelisted } from "../collectors";
import type { ScrapedItem } from "../collectors/common";
import {
  batchInsertChapters,
  getRecentChapters,
  loadWhitelist,
  saveSourceHealthMap,
  writeCronStatus,
  type ChapterRow,
} from "../storage/db";
import { dispatch } from "../services/dispatch";
import { retryFailedDispatches } from "../services/retry";
import { unclaimStale } from "../services/claim";
import { nowIso, parseTs } from "../utils/text";

const logger = getLogger("cron:pipeline");

export interface PipelineStats {
  status: string;
  sent: number;
  matched: number;
  fetched: number;
  duration: number;
  sources: Record<string, string>;
  retryFailed?: Record<string, number>;
}

/**
 * Drop chapters released before the freshness window.
 *
 * An unknown age is KEPT: discarding a chapter because its timestamp did not
 * parse loses a notification silently, which is worse than announcing one that
 * is slightly old.
 */
export function filterFreshWindow(items: ScrapedItem[], hours: number): ScrapedItem[] {
  if (hours <= 0) return items;
  const cutoff = Date.now() - hours * 3600 * 1000;
  const kept: ScrapedItem[] = [];
  const dropped: Record<string, number> = {};

  for (const it of items) {
    let ms: number | null = null;
    for (const field of [it.release_date, it.updated_time]) {
      const parsed = parseTs(field);
      if (parsed !== null) {
        ms = parsed;
        break;
      }
    }
    if (ms === null) {
      kept.push(it); // unknown age -> keep
      continue;
    }
    if (ms >= cutoff) kept.push(it);
    else dropped[it.source] = (dropped[it.source] ?? 0) + 1;
  }

  if (Object.keys(dropped).length > 0) {
    logger.info("pipeline: fresh-window filter", {
      window_hours: hours,
      kept: kept.length,
      dropped: Object.values(dropped).reduce((a, b) => a + b, 0),
      by_source: dropped,
    });
  }
  return kept;
}

/** Turn a stored chapter row back into the item shape the dispatch expects. */
function rowToItem(row: ChapterRow): ScrapedItem {
  let genres: string[] = [];
  try {
    const parsed = JSON.parse(row.genres || "[]");
    if (Array.isArray(parsed)) genres = parsed.map((g) => String(g));
  } catch {
    // A malformed genres blob must not break dispatch.
  }
  return {
    title: row.title ?? row.title_key,
    title_key: row.title_key,
    chapter: row.chapter ?? "",
    chapter_num: row.chapter_num ?? 0,
    url: row.chapter_url,
    chapter_url: row.chapter_url,
    source: (row.source ?? "") as ScrapedItem["source"],
    cover: row.cover,
    series_url: row.series_url ?? "",
    origin: row.origin ?? "",
    updated_time: row.updated_time ?? "",
    release_date: row.release_date ?? "",
    rating: row.rating,
    genres,
    description: row.description ?? "",
    type: row.type ?? "",
  };
}

export interface PipelineOptions {
  doDispatch?: boolean;
  dryRun?: boolean;
  source?: string | null;
  hours?: number;
}

export async function runPipeline(
  env: Env,
  opts: PipelineOptions = {},
): Promise<PipelineStats> {
  const start = Date.now();
  const doDispatch = opts.doDispatch ?? true;
  const hours = opts.hours ?? freshWindowHours(env);

  const stats: PipelineStats = {
    status: "ok",
    sent: 0,
    matched: 0,
    fetched: 0,
    duration: 0,
    sources: {},
  };

  try {
    if (!doDispatch) {
      // ── Fetch mode: scrape and persist only ──
      const { items, health } = await collectRecentChapters(env, {
        source: opts.source ?? null,
        withWhitelistedShinigami: true,
        hoursCutoff: hours,
      });

      await saveSourceHealthMap(env, health).catch((err) =>
        logger.warn("collect health persist failed", { err: String(err).slice(0, 160) }),
      );

      const fresh = filterFreshWindow(items, hours);
      const insert = await batchInsertChapters(env, fresh as unknown as Array<Record<string, unknown>>);

      stats.fetched = fresh.length;
      stats.sources = Object.fromEntries(
        Object.entries(health).map(([k, v]) => [k, v.status]),
      );
      if (insert.failed > 0) {
        logger.error("pipeline: batch insert partial failure", { ...insert });
        stats.status = "partial";
      }
    } else {
      // ── Dispatch mode: read what the fetch pass stored ──
      await unclaimStale(env).catch(() => undefined);

      const rows = await getRecentChapters(env, hours);
      const items = rows.map(rowToItem);

      const whitelist = await loadWhitelist(env);
      const toDispatch = whitelist.length > 0 ? filterWhitelisted(items, whitelist) : [];

      const send = await dispatch(env, toDispatch, { dryRun: opts.dryRun ?? false });
      stats.sent = send.sent;
      stats.matched = toDispatch.length;
      stats.fetched = items.length;

      if (!opts.dryRun) {
        try {
          const retry = await retryFailedDispatches(env);
          stats.retryFailed = { ...retry };
        } catch (err) {
          logger.error("pipeline retry_failed failed", { err: String(err).slice(0, 160) });
        }
      }
    }

    stats.duration = Math.round((Date.now() - start) / 100) / 10;
    await writeCronStatus(env, {
      status: stats.status,
      chapters_sent: stats.sent,
      matched: stats.matched,
      duration_s: stats.duration,
    });
    logger.info("Cron completed", { ...stats });
    return stats;
  } catch (err) {
    logger.error("pipeline error", { err: String(err).slice(0, 300) });
    stats.status = "error";
    stats.duration = Math.round((Date.now() - start) / 100) / 10;
    await writeCronStatus(env, { status: "error", duration_s: stats.duration }).catch(
      () => undefined,
    );
    return stats;
  }
}

/** Convenience: the two passes the cron triggers call. */
export async function runFetchPass(env: Env, source?: string | null): Promise<PipelineStats> {
  return runPipeline(env, { doDispatch: false, source: source ?? null });
}

export async function runDispatchPass(env: Env, dryRun = false): Promise<PipelineStats> {
  return runPipeline(env, { doDispatch: true, dryRun });
}

export { nowIso };
