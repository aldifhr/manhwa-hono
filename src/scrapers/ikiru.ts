/**
 * Ikiru API client (09.ikiru.wtf).
 *
 * Ported from app/scrapers/ikiru/__init__.py.
 *
 * Two surfaces, both verified live:
 *   /api/public/library/search?type=MANHWA|MANHUA|MANGA&page=N&limit=M
 *   /api/public/manga/{slug}
 *
 * `limit` IS honoured here (unlike voratoon). Rows carry full metadata AND the
 * series' latest chapter with a real `updatedAt`, so one request per page is
 * everything the pipeline needs.
 *
 * TIMESTAMPS: ikiru emits WIB wall-clock (UTC+7) but suffixes it with `Z`.
 * Parsing naively lands every chapter 7 hours in the future, and a future
 * timestamp fails the freshness window — the whole feed silently disappears.
 * parseIkiruTs() applies the correction.
 *
 * CHAPTER URL: /manga/{slug}/chapter-{n} — a HYPHEN, not a slash. The slash
 * form 404s, which makes every Discord link dead while the chapter still looks
 * collected.
 */
import { SOURCES } from "../config";
import { getLogger } from "../logger";
import { parseIkiruTs } from "../utils/text";

const logger = getLogger("scraper:ikiru");

const TIMEOUT_MS = 20_000;
const DEFAULT_LIMIT = 50;
const MAX_PAGES = 60;

/** The three catalogue types, mapped to the origin codes the pipeline uses. */
export const TYPE_TO_ORIGIN: Record<string, { type: string; origin: string }> = {
  MANHWA: { type: "manhwa", origin: "KR" },
  MANHUA: { type: "manhua", origin: "CN" },
  MANGA: { type: "manga", origin: "JP" },
};

/**
 * Shelves actually ingested. MANGA (JP) is excluded on purpose — see
 * iterAllSeries(). Add "MANGA" here to bring JP back.
 */
export const SHELVES: Array<keyof typeof TYPE_TO_ORIGIN> = ["MANHWA", "MANHUA"];

export function ikiruApiBase(): string {
  return SOURCES.ikiru.api.replace(/\/+$/, "");
}

export function ikiruPublicBase(): string {
  return SOURCES.ikiru.public.replace(/\/+$/, "");
}

export interface IkiruRow {
  slug?: string;
  title?: string;
  description?: string;
  coverImage?: string;
  score?: number;
  rating?: number;
  genres?: unknown;
  updatedAt?: string;
  chapters?: unknown;
  [k: string]: unknown;
}

/** GET JSON with one retry on a Cloudflare-shaped failure. Null on failure. */
async function get<T = unknown>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T | null> {
  const url = new URL(`${ikiruApiBase()}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    url.searchParams.set(k, String(v));
  }

  let last: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json", "User-Agent": "manhwa-hono/0.1" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status !== 200) {
        last = `HTTP ${res.status}`;
        continue;
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        // A 200 that is not JSON is a Cloudflare interstitial.
        last = "non-JSON body (Cloudflare challenge?)";
        continue;
      }
      const obj = data as { success?: boolean; message?: string; data?: T };
      if (obj?.success === false) {
        last = String(obj.message ?? "success=false");
        continue;
      }
      return (obj?.data ?? null) as T | null;
    } catch (err) {
      last = `${(err as Error)?.name ?? "Error"}: ${String(err)}`;
    }
  }
  logger.warn("ikiru request failed", { path, err: String(last).slice(0, 160) });
  return null;
}

export interface IkiruPage {
  rows: IkiruRow[];
  total: number;
}

/** One catalogue page. */
export async function getLibraryPage(
  page = 1,
  limit = DEFAULT_LIMIT,
  mangaType: keyof typeof TYPE_TO_ORIGIN = "MANHWA",
): Promise<IkiruPage> {
  const data = await get<{ mangas?: IkiruRow[]; total?: number }>(
    "/api/public/library/search",
    { type: mangaType, page, limit, sortBy: "updated", sort: "desc" },
  );
  if (!data || !Array.isArray(data.mangas)) return { rows: [], total: 0 };
  const total = Number.parseInt(String(data.total ?? 0), 10);
  return { rows: data.mangas, total: Number.isFinite(total) ? total : 0 };
}

/** Series detail. `chapters.chapters[]` holds the full chapter list. */
export async function getSeriesDetail(slug: string): Promise<Record<string, unknown> | null> {
  const data = await get<Record<string, unknown>>(`/api/public/manga/${encodeURIComponent(slug)}`);
  return data && typeof data === "object" ? data : null;
}

/** Reader URL for a chapter. HYPHEN separator — see the module docstring. */
export function chapterUrl(slug: string, number: string | number): string {
  return `${ikiruPublicBase()}/manga/${slug}/chapter-${number}`;
}

export function seriesUrl(slug: string): string {
  return `${ikiruPublicBase()}/manga/${slug}`;
}

/** Walk the catalogue shelves that are actually ingested. */
export async function* iterAllSeries(
  maxPages = MAX_PAGES,
): AsyncGenerator<{ mangaType: string; row: IkiruRow }> {
  for (const mangaType of SHELVES) {
    let page = 1;
    let seen = 0;
    while (page <= maxPages) {
      const { rows, total } = await getLibraryPage(page, DEFAULT_LIMIT, mangaType);
      if (rows.length === 0) break;
      for (const row of rows) {
        if (row && typeof row === "object" && row.slug) {
          yield { mangaType, row };
        }
      }
      seen += rows.length;
      if (total && seen >= total) break;
      page++;
    }
  }
}

/** Exposed for the collector's timestamp handling. */
export { parseIkiruTs };
