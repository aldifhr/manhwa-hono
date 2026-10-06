/**
 * Shinigami collector.
 *
 * Ported from app/cron/collectors/shinigami.py.
 *
 * Two things this source needs that the others do not:
 *
 *  1. The whitelist drives the work. Shinigami's latest-updates feed only
 *     reports the newest chapter per series, so a series that drops 5 chapters
 *     at once would lose four of them. For whitelisted series we therefore walk
 *     the chapter list directly (bounded by the freshness window).
 *
 *  2. A `latest_sent_chapter` ceiling. Without it, walking the chapter list
 *     re-offers every old chapter on every cycle.
 */
import type { Env } from "../config";
import { getLogger } from "../logger";
import {
  getChapters,
  getLatestUpdates,
  shinigamiPublicBase,
  type ShinigamiLatestItem,
} from "../scrapers/shinigami";
import { normalizeChapter, slugifyTitleKey, truncate } from "../utils/text";
import { chapterNum, type CollectorContext, type ScrapedItem } from "./common";

const logger = getLogger("cron:collect:shinigami");

const PER_PAGE = 100;
const MAX_PAGES = 5;

/**
 * How many whitelisted series one tick may walk.
 *
 * Two ceilings shape this, and the tighter one wins:
 *
 *   * Subrequests — the Workers FREE plan allows 50 per invocation. Walking all
 *     ~246 whitelisted shinigami series would need 246 requests in one tick and
 *     be killed outright.
 *   * Wall time — the walk is SERIAL and each series costs one request, so the
 *     budget must also fit the collector's 60s timeout. Measured against the
 *     live API: roughly 1s per series when the upstream is warm, so 12 leaves
 *     comfortable headroom. A larger budget does not degrade gracefully — the
 *     whole walk is abandoned and the cursor never advances, so nothing gets
 *     covered at all.
 *
 * The walk therefore takes a bounded slice per tick and rotates through the
 * rest via a stored cursor, covering every series within a few ticks.
 *
 * The latest-updates feed is the primary path (one request per page, newest
 * chapter per series); this walk exists to catch the chapters BETWEEN the
 * ceiling and the newest one, which the feed collapses into a single row.
 */
const WALK_BUDGET_PER_TICK = 12;

/** Map shinigami country_id -> the origin codes the pipeline uses. */
function originOf(item: ShinigamiLatestItem): string {
  const c = String(item.country_id ?? "").toUpperCase();
  if (c === "KR" || c === "CN" || c === "JP") return c;
  return "";
}

function typeOf(origin: string): string {
  return { KR: "manhwa", CN: "manhua", JP: "manga" }[origin] ?? "";
}

function titleOf(item: ShinigamiLatestItem): string {
  return String(item.title ?? "").replace(/’/g, "'").trim();
}

function coverOf(item: ShinigamiLatestItem): string | null {
  const c = item.cover_image_url ?? item.cover_portrait_url;
  return c ? String(c) : null;
}

/**
 * Latest-updates pass: one item per recently-updated series.
 *
 * `latest_chapter` is the chapter to announce, and `latest_chapter_time` its
 * timestamp.
 */
export async function collectShinigamiLatest(
  ctx: CollectorContext,
  hoursCutoff: number,
): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const updates = await getLatestUpdates(1, PER_PAGE, 10, hoursCutoff);
  const publicBase = shinigamiPublicBase();

  for (const it of updates) {
    const title = titleOf(it);
    const mangaId = it.manga_id;
    if (!title || !mangaId) continue;

    const chapterRaw = it.latest_chapter ?? it.latest_chapter_number ?? null;
    if (chapterRaw === null || chapterRaw === undefined) continue;

    const rawTs = it.latest_chapter_time ?? it.updated_at ?? it.created_at ?? null;
    const tsMs = rawTs ? Date.parse(String(rawTs)) : Number.NaN;
    if (!Number.isFinite(tsMs)) continue;
    const iso = new Date(tsMs).toISOString();

    const origin = originOf(it);
    const titleKey = slugifyTitleKey(title);
    const chapterStr = String(chapterRaw);

    // Honour the ceiling: never re-offer a chapter already sent.
    const ceiling = ctx.latestSent.get(`${titleKey}|shinigami`) ?? 0;
    if (chapterNum(normalizeChapter(chapterStr)) <= ceiling) continue;

    const url = `${publicBase}/chapter/${mangaId}-${chapterStr}`;
    items.push({
      title,
      title_key: titleKey,
      chapter: chapterStr,
      chapter_num: chapterNum(normalizeChapter(chapterStr)),
      url,
      chapter_url: url,
      source: "shinigami",
      cover: coverOf(it),
      series_url: `${publicBase}/series/${mangaId}`,
      origin,
      updated_time: iso,
      release_date: iso,
      rating: null,
      genres: [],
      description: "",
      type: typeOf(origin),
    });
  }

  logger.info("shinigami latest collect done", { items: items.length, updates: updates.length });
  return items;
}

/**
 * Whitelisted-series pass: walk the chapter list so a batch release is not
 * truncated to its newest chapter.
 *
 * Only series whitelisted ON shinigami are walked — a series subscribed via
 * another source is that source's job.
 */
export async function collectShinigamiWhitelisted(
  ctx: CollectorContext,
  whitelist: Array<{ title_key: string; source: string; url?: string | null; series_url?: string | null; title?: string | null }>,
  hoursCutoff: number,
  opts: { budget?: number; cursor?: number } = {},
): Promise<{ items: ScrapedItem[]; nextCursor: number; total: number }> {
  const publicBase = shinigamiPublicBase();
  const items: ScrapedItem[] = [];
  const seenIds = new Set<string>();

  // Collect the manga ids to walk.
  const allTargets: Array<{ mangaId: string; titleKey: string; title: string }> = [];
  for (const w of whitelist) {
    if (w.source !== "shinigami") continue;
    const titleKey = slugifyTitleKey(w.title_key ?? "");
    if (!titleKey) continue;

    let mangaId: string | null = null;
    for (const candidate of [w.url, w.series_url]) {
      if (!candidate) continue;
      const m = /shinigami\.(?:asia|id)\/(?:series\/)?([^/?#]+)\/?$/.exec(String(candidate));
      if (m?.[1]) {
        mangaId = m[1];
        break;
      }
    }
    if (!mangaId || seenIds.has(mangaId)) continue;
    seenIds.add(mangaId);
    allTargets.push({ mangaId, titleKey, title: String(w.title ?? titleKey.replace(/-/g, " ")) });
  }

  const total = allTargets.length;
  if (total === 0) return { items: [], nextCursor: 0, total: 0 };

  // Bounded slice, rotating via the cursor so successive ticks cover the rest.
  const budget = Math.max(1, opts.budget ?? WALK_BUDGET_PER_TICK);
  const start = total > 0 ? (opts.cursor ?? 0) % total : 0;
  const targets: typeof allTargets = [];
  for (let i = 0; i < Math.min(budget, total); i++) {
    const t = allTargets[(start + i) % total];
    if (t) targets.push(t);
  }
  const nextCursor = (start + targets.length) % total;

  logger.info("shinigami walk slice", {
    walked: targets.length,
    total,
    from: start,
    next: nextCursor,
  });

  for (const t of targets) {
    let chapters: Awaited<ReturnType<typeof getChapters>>;
    try {
      chapters = await getChapters(t.mangaId, PER_PAGE, MAX_PAGES, hoursCutoff);
    } catch (err) {
      logger.warn("whitelisted shinigami walk failed", {
        mangaId: t.mangaId,
        err: String(err).slice(0, 120),
      });
      continue;
    }

    const ceiling = ctx.latestSent.get(`${t.titleKey}|shinigami`) ?? 0;
    const seriesUrl = `${publicBase}/series/${t.mangaId}`;

    for (const ch of chapters) {
      const num = ch.chapter_number ?? ch.number ?? ch.chapter ?? null;
      if (num === null || num === undefined) continue;
      const chapterStr = String(num);
      const numValue = chapterNum(normalizeChapter(chapterStr));
      // Skip anything at or below the ceiling — this is the guard that stops
      // a chapter-list walk from re-announcing the whole archive.
      if (numValue <= ceiling) continue;

      const chId = ch.chapter_id ?? ch.id ?? null;
      const rawTs = ch.release_date ?? ch.created_at ?? null;
      const tsMs = rawTs ? Date.parse(String(rawTs)) : Number.NaN;
      const iso = Number.isFinite(tsMs) ? new Date(tsMs).toISOString() : "";

      const url = chId
        ? `${publicBase}/chapter/${chId}`
        : String(ch.url ?? `${publicBase}/series/${t.mangaId}`);

      items.push({
        title: t.title,
        title_key: t.titleKey,
        chapter: chapterStr,
        chapter_num: numValue,
        url,
        chapter_url: url,
        source: "shinigami",
        cover: null,
        series_url: seriesUrl,
        origin: "",
        updated_time: iso,
        release_date: iso,
        rating: null,
        genres: [],
        description: truncate("", 2000),
        type: "",
      });
    }
  }

  logger.info("shinigami whitelisted collect done", {
    items: items.length,
    series: targets.length,
    next_cursor: nextCursor,
  });
  return { items, nextCursor, total };
}
