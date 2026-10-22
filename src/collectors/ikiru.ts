/**
 * Ikiru collector.
 *
 * Ported from app/cron/collectors/ikiru.py (simplified: discovery pass only).
 */
import { SOURCES, type Env } from "../config";
import { getLogger } from "../logger";
import {
  getProjectPage,
  getSeriesDetail,
  ikiruPublicBase,
  seriesUrlFor,
  chapterUrlFor,
  deriveFormat,
} from "../scrapers/ikiru";
import { normalizeChapter, parseTs, slugifyTitleKey, stripHtml, truncate } from "../utils/text";
import { chapterNum, type CollectorContext, type ScrapedItem } from "./common";

const logger = getLogger("cron:collect:ikiru");

const MAX_PAGES = 1;
const MAX_CHAPTERS_PER_SERIES = 25;

export async function collectIkiru(ctx: CollectorContext, _fetchMeta: boolean): Promise<ScrapedItem[]> {
  const { env, latestSent } = ctx;
  const publicBase = ikiruPublicBase();
  const items: ScrapedItem[] = [];
  const have = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await getProjectPage(page);
    if (!data || Object.keys(data).length === 0) break;
    const projects = (data.data as { project?: unknown[] })?.project;
    if (!Array.isArray(projects) || projects.length === 0) break;

    for (const series of projects) {
      if (!series || typeof series !== "object") continue;
      const s = series as Record<string, unknown>;
      const title = String(s.title ?? "").trim();
      if (!title) continue;
      const slug = String(s.slug ?? "");
      if (!slug) continue;
      const tk = slugifyTitleKey(title);
      const seriesUrl = seriesUrlFor(slug);

      const rawType = String(s.type ?? "").trim();
      const [ctype, origin] = deriveFormat(rawType);

      const cover = String(s.featuredImage ?? "");
      const meta = (s.metadata ?? {}) as Record<string, unknown>;
      const ratingRaw = meta.score;
      const rating = ratingRaw === null || ratingRaw === undefined ? null : Number(ratingRaw);
      const genres = Array.isArray(meta.genre)
        ? (meta.genre as Array<Record<string, unknown>>)
            .map((g) => String(g?.name ?? ""))
            .filter(Boolean)
        : [];

      const chapters = Array.isArray(s.chapter) ? (s.chapter as Array<Record<string, unknown>>) : [];
      const ceiling = latestSent.get(`${tk}|ikiru`) ?? 0;

      const freshChapters = chapters.filter((ch) => {
        const chNum = ch.number;
        if (chNum === null || chNum === undefined) return false;
        const ts = parseTs(ch.updatedAt);
        if (ts === null) return false;
        const iso = new Date(ts).toISOString();
        if (ts < Date.now() - 24 * 3600 * 1000) return false;
        const num = chapterNum(normalizeChapter(String(chNum)));
        if (num > 0 && ceiling > 0 && num <= ceiling) return false;
        return true;
      });

      if (freshChapters.length === 0) continue;

      // Fetch detail for description
      const detail = await getSeriesDetail(slug);
      const dd = (detail?.data ?? detail) as Record<string, unknown>;
      let description = "";
      if (dd && typeof dd === "object") {
        const rawDesc = String(dd.description ?? "").trim();
        if (rawDesc) description = truncate(stripHtml(rawDesc), 2000);
      }

      let kept = 0;
      for (const ch of freshChapters) {
        if (kept >= MAX_CHAPTERS_PER_SERIES) break;
        const chNum = ch.number;
        const ts = parseTs(ch.updatedAt)!;
        const iso = new Date(ts).toISOString();
        const chStr = String(chNum);
        const num = chapterNum(normalizeChapter(chStr));
        const chSlug = String((ch as Record<string, unknown>).slug ?? "");
        const url = chapterUrlFor(slug, chNum as string | number, chSlug);
        const key = `${tk}|${chStr}`;
        if (have.has(key)) continue;
        have.add(key);
        kept++;

        items.push({
          title,
          title_key: tk,
          chapter: chStr,
          chapter_num: num,
          url,
          chapter_url: url,
          source: "ikiru",
          cover: cover || null,
          series_url: seriesUrl,
          origin,
          updated_time: iso,
          release_date: iso,
          rating: Number.isFinite(rating as number) ? (rating as number) : null,
          genres,
          description,
          type: ctype,
        });
      }
    }

    logger.info("ikiru collect done", { page, items: items.length });
  }

  // Pass B: direct poll of whitelisted series via detail endpoint
  // (simplified: skip for now, discovery pass covers most cases)

  logger.info("ikiru collect done", { items: items.length });
  return items;
}
