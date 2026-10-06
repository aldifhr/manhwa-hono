/**
 * Voratoon collector.
 *
 * Ported from app/cron/collectors/voratoon.py.
 *
 * The site's own request shape (`sort=latest&sortOrder=desc&takeChapter=4`)
 * sorts by updatedAt and embeds the newest chapters per series, so one page is
 * the whole "recently updated" index — no per-series chapter calls needed.
 *
 * GENRES: the catalogue payload embeds genre objects per series, so the genre
 * -id lookup table is only needed when a series arrives without them. It is
 * resolved lazily and memoised, because a previous version fetched it up front
 * on every cycle and logged a warning each time that call 403'd — for a lookup
 * nothing on the hot path actually used.
 */
import { SOURCES, voratoonProxyBase, type Env } from "../config";
import { getLogger } from "../logger";
import { deriveFormat, getGenres, voratoonPublicBase } from "../scrapers/voratoon";
import { normalizeChapter, parseTs, slugifyTitleKey, stripHtml, truncate } from "../utils/text";
import { chapterNum, type CollectorContext, type ScrapedItem } from "./common";

const logger = getLogger("cron:collect:voratoon");

const TAKE_PER_PAGE = 10;
const MAX_PAGES = 12;
const TIMEOUT_MS = 25_000;

interface CatalogueSeries {
  id: number | string | null;
  updatedAt: string;
  data: Record<string, unknown>;
  chapters: Array<Record<string, unknown>>;
}

/** Pull the series array out of a catalogue page payload. */
function parseCatalogue(payload: unknown): CatalogueSeries[] {
  if (!payload || typeof payload !== "object") return [];
  const rows = (payload as { data?: unknown }).data;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const rec = r as Record<string, unknown>;
      const inner = (
        rec.data && typeof rec.data === "object" ? rec.data : {}
      ) as Record<string, unknown>;
      const chapters = Array.isArray(rec.chapters)
        ? (rec.chapters as Array<Record<string, unknown>>)
        : [];
      return {
        id: (rec.id as number | string) ?? null,
        updatedAt: String(rec.updatedAt ?? ""),
        data: inner,
        chapters,
      };
    });
}

/** Names out of the embedded genre objects. */
function genreNames(inner: Record<string, unknown>): string[] {
  const raw = inner.genres;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    const rec = g as Record<string, unknown>;
    const d = (rec.data && typeof rec.data === "object" ? rec.data : rec) as Record<string, unknown>;
    if (d.name) out.push(String(d.name));
  }
  return out;
}

/** Build the catalogue URL, routing through the egress proxy when configured. */
function catalogueUrl(env: Env, page: number): string {
  const upstream = new URL(`${SOURCES.voratoon.api}/series`);
  upstream.searchParams.set("take", String(TAKE_PER_PAGE));
  upstream.searchParams.set("page", String(page));
  upstream.searchParams.set("sort", "latest");
  upstream.searchParams.set("sortOrder", "desc");
  upstream.searchParams.set("includeMeta", "true");
  upstream.searchParams.set("takeChapter", "4");

  const proxy = voratoonProxyBase(env);
  return proxy ? `${proxy}/?url=${encodeURIComponent(upstream.toString())}` : upstream.toString();
}

export async function collectVoratoon(
  ctx: CollectorContext,
  _fetchMeta: boolean,
): Promise<ScrapedItem[]> {
  const { env } = ctx;
  const publicBase = voratoonPublicBase();
  const items: ScrapedItem[] = [];

  // Lazily-built genre-id table (see module docstring).
  let genresCache: Record<number, string> | null = null;
  const genreName = async (gid: number): Promise<string | null> => {
    if (genresCache === null) {
      try {
        genresCache = await getGenres(env);
      } catch {
        genresCache = {};
      }
    }
    return genresCache[gid] ?? null;
  };

  const byId = new Map<string, CatalogueSeries>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    let payload: unknown = null;
    try {
      const res = await fetch(catalogueUrl(env, page), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        payload = await res.json();
      } else {
        logger.warn("voratoon page failed", { page, status: res.status });
      }
    } catch (err) {
      logger.warn("voratoon page error", { page, err: String(err).slice(0, 120) });
    }

    const rows = parseCatalogue(payload);
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.id !== null) byId.set(String(r.id), r);
    }
  }

  if (byId.size === 0) {
    logger.warn("voratoon collect produced nothing");
    return [];
  }

  for (const series of byId.values()) {
    const inner = series.data;
    const title = String(inner.title ?? "").trim();
    const slug = String(inner.slug ?? "");
    if (!title || !slug) continue;

    const [ctype, origin] = deriveFormat(inner.format ?? inner.type);
    const titleKey = slugifyTitleKey(title);

    let genres = genreNames(inner);
    if (genres.length === 0 && Array.isArray(inner.genreIds)) {
      const names: string[] = [];
      for (const gid of inner.genreIds) {
        if (typeof gid !== "number") continue;
        const name = await genreName(gid);
        if (name) names.push(name);
      }
      genres = names;
    }

    const seriesUrl = `${publicBase}/series/${slug}`;
    const cover = String(inner.coverImage ?? "");
    const ratingRaw = inner.rating;
    const rating = ratingRaw === null || ratingRaw === undefined ? null : Number(ratingRaw);
    const description = truncate(stripHtml(String(inner.synopsis ?? "")), 2000);

    for (const ch of series.chapters) {
      const idx = ch.chapterIndex;
      if (idx === null || idx === undefined) continue;
      const tsMs = parseTs(ch.createdAt ?? ch.updatedAt);
      if (tsMs === null) continue;
      const iso = new Date(tsMs).toISOString();
      const chapterStr = String(idx);
      const url = `${publicBase}/series/${slug}/chapter/${idx}`;

      items.push({
        title,
        title_key: titleKey,
        chapter: chapterStr,
        chapter_num: chapterNum(normalizeChapter(chapterStr)),
        url,
        chapter_url: url,
        source: "voratoon",
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

  logger.info("voratoon collect done", { items: items.length, series: byId.size });
  return items;
}
