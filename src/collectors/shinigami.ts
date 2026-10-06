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
): Promise<ScrapedItem[]> {
  const publicBase = shinigamiPublicBase();
  const items: ScrapedItem[] = [];
  const seenIds = new Set<string>();

  // Collect the manga ids to walk.
  const targets: Array<{ mangaId: string; titleKey: string; title: string }> = [];
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
    targets.push({ mangaId, titleKey, title: String(w.title ?? titleKey.replace(/-/g, " ")) });
  }

  if (targets.length === 0) return [];

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
  });
  return items;
}
