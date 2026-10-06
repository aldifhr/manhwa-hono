/**
 * Shinigami API client (api.shngm.io/v1).
 *
 * Ported from app/scrapers/shinigami/__init__.py.
 *
 * This API does NOT sit behind Cloudflare, so a plain fetch works — the Python
 * version kept a curl_cffi fallback only because it ran behind an httpx client
 * that occasionally got TLS-fingerprinted. On Workers there is no curl_cffi,
 * so this port relies on the platform's own TLS stack; if the upstream ever
 * starts fingerprinting, the fix is a proxy var (same shape as voratoon's), not
 * a native module.
 */
import { SOURCES } from "../config";
import { getLogger } from "../logger";
import { stripHtml } from "../utils/text";

const logger = getLogger("shinigami:api");

const TIMEOUT_MS = 15_000;

export function shinigamiApiBase(): string {
  return SOURCES.shinigami.api.replace(/\/+$/, "");
}

export function shinigamiPublicBase(): string {
  return SOURCES.shinigami.public.replace(/\/+$/, "");
}

export interface ShinigamiLatestItem {
  manga_id?: string;
  title?: string;
  latest_chapter?: string | number;
  latest_chapter_time?: string;
  updated_at?: string;
  created_at?: string;
  cover_image_url?: string;
  cover_portrait_url?: string;
  user_rate?: number;
  rating?: number;
  country_id?: string;
  taxonomy?: Record<string, Array<{ name?: string }>>;
  description?: string;
  release_year?: number | string;
  [k: string]: unknown;
}

/** GET JSON with jittered backoff. Null on failure. */
async function get<T = unknown>(path: string, retries = 4): Promise<T | null> {
  const url = `${shinigamiApiBase()}${path}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 200) {
        return (await res.json()) as T;
      }
      if ([429, 403, 500, 502, 503].includes(res.status) && attempt < retries) {
        // Respect Retry-After when present, else jittered backoff.
        const retryAfter = res.headers.get("retry-after");
        const parsed = retryAfter ? Number.parseFloat(retryAfter) : Number.NaN;
        const waitMs = Number.isFinite(parsed)
          ? parsed * 1000
          : Math.min(3000 * (attempt + 1), 12_000) + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      logger.debug("shinigami HTTP error", { path, status: res.status });
      return null;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) =>
          setTimeout(r, Math.min(3000 * (attempt + 1), 12_000) + Math.random() * 1000),
        );
        continue;
      }
      logger.debug("shinigami fetch failed", { path, err: String(err).slice(0, 120) });
    }
  }
  return null;
}

/**
 * Latest updates across both manga types (mirror + project).
 *
 * Early-stops when a page contains nothing inside the cutoff: the endpoint
 * sorts by latest, so everything deeper is older. That keeps a quiet cycle to
 * one page instead of ten.
 */
export async function getLatestUpdates(
  page = 1,
  perPage = 100,
  maxPages = 10,
  hoursCutoff = 24,
): Promise<ShinigamiLatestItem[]> {
  const cutoff = Date.now() - hoursCutoff * 3600 * 1000;

  const isFresh = (item: ShinigamiLatestItem): boolean => {
    const raw = item.latest_chapter_time ?? item.updated_at ?? item.created_at ?? "";
    if (!raw) return false;
    const ms = Date.parse(String(raw));
    return Number.isFinite(ms) ? ms >= cutoff : false;
  };

  const all: ShinigamiLatestItem[] = [];
  const seen = new Set<string>();

  for (const mtype of ["mirror", "project"] as const) {
    for (let p = 1; p <= maxPages; p++) {
      const data = await get<{ data?: ShinigamiLatestItem[] }>(
        `/manga/list?type=${mtype}&page=${p}&page_size=${perPage}&is_update=true&sort=latest&sort_order=desc`,
      );
      const items = data?.data;
      if (!Array.isArray(items) || items.length === 0) break;

      let hasFresh = false;
      for (const it of items) {
        if (isFresh(it)) hasFresh = true;
        const mid = it.manga_id;
        if (mid && !seen.has(mid)) {
          seen.add(mid);
          all.push(it);
        }
      }
      if (!hasFresh) break;
      if (items.length < perPage) break;
    }
  }
  return all;
}

export interface ShinigamiSeriesDetail {
  title?: string;
  description?: string;
  cover_image_url?: string;
  cover_portrait_url?: string;
  user_rate?: number;
  rating?: number;
  country_id?: string;
  release_year?: number | string;
  taxonomy?: Record<string, Array<{ name?: string }>>;
  [k: string]: unknown;
}

export async function getSeries(mangaId: string): Promise<ShinigamiSeriesDetail | null> {
  const data = await get<{ data?: ShinigamiSeriesDetail }>(`/manga/detail/${mangaId}`);
  return data?.data ?? null;
}

/** Map shinigami country_id to content type: KR->manhwa, CN->manhua, JP->manga. */
export function countryToType(countryId: string | null | undefined): string | null {
  if (!countryId) return null;
  return { KR: "manhwa", CN: "manhua", JP: "manga" }[countryId.toUpperCase()] ?? null;
}

export interface ShinigamiMeta {
  cover: string | null;
  rating: number | null;
  genres: string[];
  description: string;
  author: string | null;
  artist: string | null;
  type: string | null;
  released: string;
  origin: string | null;
  source: "shinigami";
  series_url: string;
}

/** Normalise series detail into the flat metadata the pipeline stores. */
export async function getSeriesMeta(mangaId: string): Promise<ShinigamiMeta | null> {
  const d = await getSeries(mangaId);
  if (!d) return null;
  // taxonomy can be a LIST in some responses; a .get() on it would throw and
  // kill the whole cron prefetch.
  const tax = (d.taxonomy && typeof d.taxonomy === "object" && !Array.isArray(d.taxonomy)
    ? d.taxonomy
    : {}) as Record<string, Array<{ name?: string }>>;

  const names = (key: string): string[] =>
    (tax[key] ?? []).map((g) => g?.name).filter((n): n is string => Boolean(n));

  const genres = names("Genre");
  const authors = names("Author");
  const artists = names("Artist");
  const formats = names("Format");
  const types = names("Type");

  const rawRate = d.user_rate ?? d.rating ?? null;
  const rating = rawRate === null ? null : Number(rawRate);

  return {
    cover: d.cover_image_url ?? d.cover_portrait_url ?? null,
    rating: Number.isFinite(rating as number) ? (rating as number) : null,
    genres,
    description: stripHtml(d.description ?? "").slice(0, 2000),
    author: authors.length ? authors.join(", ") : null,
    artist: artists.length ? artists.join(", ") : null,
    type:
      countryToType(d.country_id) ?? ((formats[0] ?? types[0] ?? "").toLowerCase() || null),
    released: String(d.release_year ?? ""),
    origin: d.country_id ?? null,
    source: "shinigami",
    series_url: `${shinigamiPublicBase()}/series/${mangaId}`,
  };
}

export interface ShinigamiChapter {
  chapter_id?: string;
  id?: string;
  chapter_number?: number | string;
  number?: number | string;
  chapter?: number | string;
  release_date?: string;
  created_at?: string;
  url?: string;
  [k: string]: unknown;
}

/**
 * Chapter list for one series, sorted chapter_number desc.
 *
 * `withinHours` switches to adaptive pagination: keep fetching while chapters
 * are inside the window, stop as soon as a whole page is outside it. Because
 * the sort is descending, chapters outside the window always sit behind the
 * fresh ones — no page count needs to be guessed. maxPages stays a hard
 * ceiling so a series that dumps a huge batch still terminates.
 */
export async function getChapters(
  mangaId: string,
  perPage = 100,
  maxPages = 5,
  withinHours?: number,
): Promise<ShinigamiChapter[]> {
  const all: ShinigamiChapter[] = [];
  const seen = new Set<string>();
  const cutoff =
    withinHours && withinHours > 0 ? Date.now() - withinHours * 3600 * 1000 : null;

  const isFresh = (ch: ShinigamiChapter): boolean => {
    if (cutoff === null) return true;
    const raw = ch.release_date ?? ch.created_at ?? "";
    if (typeof raw !== "string" || !raw.trim()) return true; // undated: keep
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return true;
    return ms >= cutoff;
  };

  for (let page = 1; page <= Math.max(1, maxPages); page++) {
    const data = await get<{ data?: ShinigamiChapter[] }>(
      `/chapter/${mangaId}/list?page=${page}&page_size=${perPage}&sort_by=chapter_number&sort_order=desc`,
    );
    const items = data?.data;
    if (!Array.isArray(items) || items.length === 0) break;

    // A whole page outside the window, on a desc-sorted list, means nothing
    // deeper can be fresh.
    if (cutoff !== null && !items.some(isFresh)) break;

    let added = 0;
    for (const ch of items) {
      const id = ch.chapter_id ?? ch.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        all.push(ch);
        added++;
      }
    }
    if (added === 0 || items.length < perPage) break;
  }
  return all;
}
