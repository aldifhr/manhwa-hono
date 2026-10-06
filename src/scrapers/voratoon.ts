/**
 * Voratoon API client.
 *
 * Ported from app/scrapers/voratoon/__init__.py.
 *
 * Two API quirks shape this module:
 *
 *   1. `limit` is ignored — every page returns its own fixed count, with the
 *      real count in meta.total / meta.lastPage. Pagination walks page numbers.
 *   2. `sort` is ignored — rows come back in id order, so "recently updated"
 *      cannot be requested; the caller walks and compares itself.
 *
 * There is no country field anywhere in the payload, so origin is derived from
 * the `format` field instead.
 *
 * EGRESS: api.voratoon.com is blocked at Cloudflare's edge for the
 * manhwa-scanner VPS's IP (per-IP, not TLS-fingerprint — curl, curl_cffi and
 * tls-client all get the same 403 with no cf-ray header). When
 * VORATOON_PROXY_URL is set, requests go through that Worker instead; the
 * Worker runs on Cloudflare's own network and reaches the API fine.
 */
import { SOURCES, voratoonProxyBase, type Env } from "../config";
import { getLogger } from "../logger";

const logger = getLogger("voratoon:api");

const TIMEOUT_MS = 20_000;
/** The API ignores `limit` and answers its own page size. */
export const PAGE_SIZE = 30;

/** Minimum gap between consecutive requests, so a page walk is not a burst. */
const MIN_INTERVAL_MS = 250;
let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const gap = Date.now() - lastRequestAt;
  if (gap < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - gap));
  }
  lastRequestAt = Date.now();
}

/**
 * Format string -> (type, origin).
 *
 * The API calls this field `type`/`format` and uses values like "project" that
 * carry no geography, so anything unmapped falls back to KR. Returning an empty
 * origin would produce a null country in the feed and the frontend would have
 * to guess the flag.
 */
const FORMAT_MAP: Record<string, [string, string]> = {
  manhwa: ["manhwa", "KR"],
  manhua: ["manhua", "CN"],
  manga: ["manga", "JP"],
  manju: ["manhua", "CN"],
  project: ["manhwa", "KR"],
  comic: ["manhwa", "KR"],
  novel: ["manga", "JP"],
  novel_manga: ["manga", "JP"],
  manwha: ["manhwa", "KR"],
};

export function deriveFormat(raw: unknown): [string, string] {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/ /g, "_");
  if (!key) return ["manhwa", "KR"];
  const direct = FORMAT_MAP[key];
  if (direct) return direct;
  // Longest known prefix, so "manhwa_scan" still resolves.
  for (const known of Object.keys(FORMAT_MAP).sort((a, b) => b.length - a.length)) {
    if (key.startsWith(known)) return FORMAT_MAP[known] as [string, string];
  }
  logger.debug("voratoon unknown format, defaulting", { raw: String(raw).slice(0, 40) });
  return ["manhwa", "KR"];
}

export function voratoonApiBase(): string {
  return SOURCES.voratoon.api.replace(/\/+$/, "");
}

export function voratoonPublicBase(): string {
  return SOURCES.voratoon.public.replace(/\/+$/, "");
}

/**
 * Resolve a request URL, routing through the Worker proxy when configured.
 *
 * The proxy takes the target as a `url` query parameter:
 *   https://<worker>/?url=<encoded absolute upstream url>
 */
function resolveUrl(env: Env, path: string, params?: Record<string, string | number>): string {
  const upstream = new URL(`${voratoonApiBase()}/${path.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    upstream.searchParams.set(k, String(v));
  }
  const proxy = voratoonProxyBase(env);
  if (!proxy) return upstream.toString();
  return `${proxy}/?url=${encodeURIComponent(upstream.toString())}`;
}

async function fetchJson(
  env: Env,
  path: string,
  params?: Record<string, string | number>,
): Promise<Record<string, unknown> | null> {
  const url = resolveUrl(env, path, params);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await throttle();
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429) {
        logger.warn("voratoon rate limited", { path, attempt: attempt + 1 });
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        logger.warn("voratoon fetch failed", { path, attempt: attempt + 1, status: res.status });
        return null;
      }
      const payload = (await res.json()) as unknown;
      return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    } catch (err) {
      logger.warn("voratoon fetch failed", {
        path,
        attempt: attempt + 1,
        err: String(err).slice(0, 120),
      });
      return null;
    }
  }
  return null;
}

export interface VoratoonSeries {
  id: number | string | null;
  title: string;
  nativeTitle: string;
  slug: string;
  format: string;
  status: string;
  totalChapters: number;
  rating: number | null;
  cover: string;
  genreIds: number[];
  updatedAt: string;
}

/** Flatten the {id, data:{...}} envelope into the fields we consume. */
function seriesPayload(raw: Record<string, unknown>): VoratoonSeries {
  const d = (raw.data && typeof raw.data === "object" ? raw.data : {}) as Record<string, unknown>;
  return {
    id: (raw.id as number | string) ?? null,
    title: String(d.title ?? ""),
    nativeTitle: String(d.nativeTitle ?? ""),
    slug: String(d.slug ?? ""),
    format: String(d.format ?? d.type ?? ""),
    status: String(d.status ?? ""),
    totalChapters: Number(d.totalChapters ?? 0),
    rating: d.rating === null || d.rating === undefined ? null : Number(d.rating),
    cover: String(d.coverImage ?? ""),
    genreIds: Array.isArray(d.genreIds) ? (d.genreIds as number[]) : [],
    updatedAt: String(raw.updatedAt ?? ""),
  };
}

export interface VoratoonChapter {
  id: number | string | null;
  index: number | null;
  slug: string;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
}

function chapterPayload(raw: Record<string, unknown>): VoratoonChapter {
  const d = (raw.data && typeof raw.data === "object" ? raw.data : {}) as Record<string, unknown>;
  const idx = d.index;
  return {
    id: (raw.id as number | string) ?? null,
    index: idx === null || idx === undefined ? null : Number(idx),
    slug: String(d.slug ?? ""),
    thumbnail: String(d.thumbnail ?? ""),
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
  };
}

/** One page of series, plus the meta block. */
export async function getSeriesPage(
  env: Env,
  page = 1,
): Promise<{ rows: VoratoonSeries[]; meta: Record<string, unknown> }> {
  const payload = await fetchJson(env, "series", { page });
  if (!payload) return { rows: [], meta: {} };
  const raw = payload.data;
  const rows = Array.isArray(raw) ? raw : [];
  const meta = (payload.meta && typeof payload.meta === "object" ? payload.meta : {}) as Record<
    string,
    unknown
  >;
  return {
    rows: rows.filter((r) => r && typeof r === "object").map((r) => seriesPayload(r as Record<string, unknown>)),
    meta,
  };
}

/** genreId -> name. Only needed by the fallback catalogue walk. */
export async function getGenres(env: Env): Promise<Record<number, string>> {
  const payload = await fetchJson(env, "genres");
  const out: Record<number, string> = {};
  if (!payload) return out;
  const rows = Array.isArray(payload.data) ? payload.data : [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const d = (rec.data && typeof rec.data === "object" ? rec.data : {}) as Record<string, unknown>;
    const id = Number.parseInt(String(rec.id ?? ""), 10);
    if (Number.isFinite(id)) out[id] = String(d.name ?? "");
  }
  return out;
}

/** All chapters for one series. */
export async function getChapters(env: Env, seriesId: number | string): Promise<VoratoonChapter[]> {
  const payload = await fetchJson(env, `series/${seriesId}/chapters`);
  if (!payload) return [];
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows
    .filter((r) => r && typeof r === "object")
    .map((r) => chapterPayload(r as Record<string, unknown>));
}

export function seriesUrlFor(slugOrId: number | string): string {
  return `${voratoonPublicBase()}/series/${slugOrId}`;
}
