/**
 * Ikiru collector.
 *
 * Ported from app/cron/collectors/ikiru.py.
 *
 * ikiru's catalogue rows already carry the series' latest chapter plus full
 * metadata, so a page walk is enough — no per-series detail call on the hot
 * path.
 *
 * TIMESTAMPS: ikiru labels WIB wall-clock as `Z`. Without the -7h correction
 * every chapter lands in the future and the freshness window drops the lot.
 * parseIkiruTs() handles it; see scrapers/ikiru.ts.
 *
 * SLUGS: use ikiru's own `slug` field, never slugify(title) — a handful of
 * series have a slug that does not match their title, and the mismatch makes
 * every generated chapter URL a 404.
 */
import { getLogger } from "../logger";
import { chapterUrl, getLibraryPage, ikiruPublicBase, SHELVES, seriesUrl, TYPE_TO_ORIGIN } from "../scrapers/ikiru";
import { normalizeChapter, parseIkiruTs, slugifyTitleKey, stripHtml, truncate } from "../utils/text";
import { chapterNum, type CollectorContext, type ScrapedItem } from "./common";

const logger = getLogger("cron:collect:ikiru");

const LIMIT = 50;
const MAX_PAGES = 40;

/** Genre names out of whatever shape the row carries. */
function genreNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const g of raw) {
    if (typeof g === "string") {
      out.push(g);
    } else if (g && typeof g === "object") {
      const rec = g as Record<string, unknown>;
      const name = rec.name ?? rec.title ?? rec.genre;
      if (name) out.push(String(name));
    }
  }
  return out;
}

/**
 * The catalogue row's `chapter` field is a LIST holding the series' newest
 * chapter(s) — `[{ id, number, updatedAt }]` — not a scalar and not
 * `latestChapter`. Verified against the live API.
 */
function latestChapter(row: Record<string, unknown>): { number: string; updatedAt: string } | null {
  const raw = row.chapter;
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (first && typeof first === "object") {
      const rec = first as Record<string, unknown>;
      const num = rec.number ?? rec.chapter ?? rec.index;
      if (num !== null && num !== undefined && String(num).trim()) {
        return {
          number: String(num).trim(),
          updatedAt: String(rec.updatedAt ?? rec.updated_at ?? ""),
        };
      }
    }
  }
  // Fall back to a scalar field if a future response shape provides one.
  for (const key of ["latestChapter", "lastChapter", "chapterNumber"]) {
    const v = row[key];
    if (v !== null && v !== undefined && String(v).trim()) {
      return { number: String(v).trim(), updatedAt: String(row.updatedAt ?? "") };
    }
  }
  return null;
}

/** Series metadata lives under `metadata`; genres under `metadata.genre`. */
function metadataOf(row: Record<string, unknown>): Record<string, unknown> {
  const m = row.metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

export async function collectIkiru(
  ctx: CollectorContext,
  _fetchMeta: boolean,
): Promise<ScrapedItem[]> {
  const publicBase = ikiruPublicBase();
  const items: ScrapedItem[] = [];
  const seen = new Set<string>();

  for (const shelf of SHELVES) {
    const mapping = TYPE_TO_ORIGIN[shelf];
    if (!mapping) continue;

    let page = 1;
    let walked = 0;
    while (page <= MAX_PAGES) {
      const { rows, total } = await getLibraryPage(page, LIMIT, shelf);
      if (rows.length === 0) break;

      for (const row of rows) {
        const rec = row as Record<string, unknown>;
        const slug = String(rec.slug ?? "");
        const title = String(rec.title ?? "").trim();
        if (!slug || !title) continue;

        const chapterInfo = latestChapter(rec);
        if (!chapterInfo) continue;

        const key = `${slug}|${chapterInfo.number}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // The catalogue timestamp describes the series' latest chapter, and
        // sits on the chapter object, not the row.
        const meta = metadataOf(rec);
        const rawTs =
          chapterInfo.updatedAt ||
          rec.updatedAt ||
          rec.lastUpdated ||
          meta.updatedAt ||
          meta.lastUpdated ||
          null;
        const tsMs = parseIkiruTs(rawTs);
        if (tsMs === null) continue;
        const iso = new Date(tsMs).toISOString();

        const url = chapterUrl(slug, chapterInfo.number);
        const ratingRaw = meta.score ?? meta.rating ?? rec.score ?? rec.rating ?? null;
        const rating = ratingRaw === null ? null : Number(ratingRaw);

        items.push({
          title,
          title_key: slugifyTitleKey(title),
          chapter: chapterInfo.number,
          chapter_num: chapterNum(normalizeChapter(chapterInfo.number)),
          url,
          chapter_url: url,
          source: "ikiru",
          cover: rec.featuredImage ? String(rec.featuredImage) : null,
          series_url: seriesUrl(slug),
          origin: mapping.origin,
          updated_time: iso,
          release_date: iso,
          rating: Number.isFinite(rating as number) ? (rating as number) : null,
          genres: genreNames(meta.genre),
          description: truncate(stripHtml(String(rec.description ?? "")), 2000),
          type: mapping.type,
        });
      }

      walked += rows.length;
      if (total && walked >= total) break;
      page++;
    }
  }

  logger.info("ikiru collect done", { items: items.length, base: publicBase });
  return items;
}
