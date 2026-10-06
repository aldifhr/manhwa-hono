/**
 * Collection orchestrator.
 *
 * Ported from app/cron/collect.py.
 *
 * Runs the three sources concurrently, then applies, in order:
 *   1. cross-source dedup   (same title+chapter from two sources -> one item)
 *   2. whitelist filter     (cross-source by title, by design)
 *   3. excluded-title filter
 *
 * The ordering matters: dedup before filtering means the surviving item is the
 * one from the fastest source, which is the whole point of FCFS.
 */
import { SOURCE_KEYS, disabledSources, type Env } from "../config";
import { getLogger } from "../logger";
import { fcfsKey, slugifyTitleKey } from "../utils/text";
import { loadExcludedKeys, loadSourceHealthMap, loadWhitelist, type WhitelistRow } from "../storage/db";
import { collectIkiru } from "./ikiru";
import { collectShinigamiLatest, collectShinigamiWhitelisted } from "./shinigami";
import { collectVoratoon } from "./voratoon";
import {
  classifyFailure,
  healthyOutcome,
  type CollectorContext,
  type HealthOutcome,
  type ScrapedItem,
} from "./common";

const logger = getLogger("cron:collect");

const SOURCE_TIMEOUT_MS = 60_000;

export interface CollectResult {
  items: ScrapedItem[];
  health: Record<string, HealthOutcome>;
}

/** Load the latest-sent ceiling per (title_key, source). */
async function loadLatestSent(env: Env): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const rows = await env.DB.prepare(
      `SELECT title_key, source, latest_sent_chapter FROM whitelist`,
    ).all<{ title_key: string; source: string; latest_sent_chapter: number | null }>();
    for (const r of rows.results ?? []) {
      const tk = slugifyTitleKey(r.title_key ?? "");
      if (!tk) continue;
      const key = `${tk}|${r.source ?? ""}`;
      const v = Number(r.latest_sent_chapter ?? 0);
      out.set(key, Math.max(out.get(key) ?? 0, Number.isFinite(v) ? v : 0));
    }
  } catch (err) {
    logger.warn("load latest_sent_chapter failed", { err: String(err).slice(0, 160) });
  }
  return out;
}

/** Which sources are in cooldown, per the health table. */
async function loadDisabled(env: Env): Promise<Set<string>> {
  const disabled = disabledSources(env);
  try {
    const map = await loadSourceHealthMap(env, SOURCE_KEYS);
    const now = Date.now();
    for (const [src, row] of Object.entries(map)) {
      if (!row.disabled_until) continue;
      const until = Date.parse(row.disabled_until);
      if (Number.isFinite(until) && until > now) disabled.add(src);
    }
  } catch {
    // A health-table read failure must not stop collection.
  }
  return disabled;
}

/** Run one collector under a timeout so a hung source cannot stall the tick. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms (${label})`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function collectRecentChapters(
  env: Env,
  opts: { source?: string | null; withWhitelistedShinigami?: boolean; hoursCutoff?: number } = {},
): Promise<CollectResult> {
  const hours = opts.hoursCutoff ?? 24;
  const disabled = await loadDisabled(env);
  const latestSent = await loadLatestSent(env);
  const ctx: CollectorContext = { env, latestSent, disabled };

  const health: Record<string, HealthOutcome> = {};
  const wanted = SOURCE_KEYS.filter(
    (s) => (!opts.source || opts.source === s) && !disabled.has(s),
  );

  // Concurrent, each independently timed out.
  const runs: Array<Promise<{ source: string; items: ScrapedItem[]; outcome: HealthOutcome }>> =
    wanted.map(async (src) => {
      const t0 = Date.now();
      try {
        let items: ScrapedItem[] = [];
        if (src === "shinigami") {
          items = await withTimeout(
            collectShinigamiLatest(ctx, hours),
            SOURCE_TIMEOUT_MS,
            "shinigami",
          );
        } else if (src === "voratoon") {
          items = await withTimeout(collectVoratoon(ctx, false), SOURCE_TIMEOUT_MS, "voratoon");
        } else if (src === "ikiru") {
          items = await withTimeout(collectIkiru(ctx, false), SOURCE_TIMEOUT_MS, "ikiru");
        }
        logger.info("collect done", { source: src, count: items.length });
        return { source: src, items, outcome: healthyOutcome(Date.now() - t0) };
      } catch (err) {
        const msg = String((err as Error)?.message ?? err);
        logger.warn("collect failed", { source: src, err: msg.slice(0, 200) });
        return { source: src, items: [], outcome: classifyFailure(msg, 0) };
      }
    });

  const settled = await Promise.all(runs);
  let items: ScrapedItem[] = [];
  for (const r of settled) {
    health[r.source] = r.outcome;
    items.push(...r.items);
  }

  // Whitelisted-series walk (shinigami only): catches batch releases the
  // latest-updates feed would truncate to a single chapter.
  if (opts.withWhitelistedShinigami && !disabled.has("shinigami")) {
    try {
      const wl = await loadWhitelist(env);
      const extra = await withTimeout(
        collectShinigamiWhitelisted(ctx, wl, hours),
        SOURCE_TIMEOUT_MS,
        "shinigami-whitelisted",
      );
      items.push(...extra);
    } catch (err) {
      logger.warn("collect whitelisted shinigami failed", { err: String(err).slice(0, 120) });
    }
  }

  // ── Cross-source dedup: same title+chapter -> keep the first seen ──
  const seen = new Set<string>();
  const deduped: ScrapedItem[] = [];
  let dupCount = 0;
  for (const it of items) {
    const key = fcfsKey(it.title, it.chapter);
    if (seen.has(key)) {
      dupCount++;
      continue;
    }
    seen.add(key);
    deduped.push(it);
  }
  if (dupCount) logger.info("collect: cross-source dedup", { removed: dupCount });
  items = deduped;

  // ── Excluded titles ──
  try {
    const excluded = await loadExcludedKeys(env);
    if (excluded.size > 0) {
      const before = items.length;
      items = items.filter((it) => {
        const tk = slugifyTitleKey(it.title_key || it.title);
        return !(tk && excluded.has(`${tk}|${it.source}`));
      });
      const dropped = before - items.length;
      if (dropped) logger.info("collect: dropped excluded titles", { count: dropped });
    }
  } catch (err) {
    logger.warn("collect: exclude filter failed", { err: String(err).slice(0, 200) });
  }

  return { items, health };
}

/**
 * Keep items whose title is whitelisted on ANY source.
 *
 * Intentionally cross-source: a series is one series regardless of which site
 * carries it, and FCFS (title+chapter, source-agnostic) decides who wins.
 * Whichever source reports the chapter first gets dispatched; the other is
 * deduped. Matching per-source here would delay a notification until the
 * subscribed source happened to catch up.
 *
 * NOTE: services/retry.ts must use this SAME rule. If the two disagree, one
 * path announces a chapter the other suppresses.
 */
export function filterWhitelisted(
  items: ScrapedItem[],
  whitelist: Array<Pick<WhitelistRow, "title_key">>,
): ScrapedItem[] {
  const allowed = new Set<string>();
  for (const w of whitelist) {
    const wk = slugifyTitleKey(w.title_key ?? "");
    if (wk) allowed.add(wk);
  }
  return items.filter((it) => allowed.has(slugifyTitleKey(it.title_key ?? "")));
}
