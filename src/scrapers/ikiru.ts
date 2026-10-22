/**
 * Ikiru API client (09.ikiru.wtf/api/public).
 *
 * Ported from app/scrapers/ikiru/__init__.py.
 *
 * The API is NOT behind Cloudflare, so a plain fetch works.
 */
import { SOURCES } from "../config";
import { getLogger } from "../logger";
import { stripHtml } from "../utils/text";

const logger = getLogger("ikiru:api");

const TIMEOUT_MS = 10_000;
const PAGE_SIZE = 24;

export function ikiruApiBase(): string {
  return SOURCES.ikiru.api.replace(/\/+$/, "");
}

export function ikiruPublicBase(): string {
  return SOURCES.ikiru.public.replace(/\/+$/, "");
}

export async function getProjectPage(page = 1, limit = PAGE_SIZE): Promise<Record<string, unknown>> {
  const url = `${ikiruApiBase()}/api/public/manga/project?page=${page}&layout=vertical&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, unknown>;
    if (!data?.success) return {};
    return data;
  } catch (err) {
    logger.warn("ikiru project page failed", { err: String(err).slice(0, 120) });
    return {};
  }
}

export async function getSeriesDetail(slug: string): Promise<Record<string, unknown>> {
  const url = `${ikiruApiBase()}/api/public/manga/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, unknown>;
    if (!data?.success) return {};
    return (data.data as Record<string, unknown>) ?? {};
  } catch (err) {
    logger.warn("ikiru series detail failed", { slug, err: String(err).slice(0, 120) });
    return {};
  }
}

export function seriesUrlFor(slug: string): string {
  return `${ikiruPublicBase()}/manga/${slug}`;
}

export function chapterUrlFor(slug: string, chapterNumber: string | number, chapterSlug = ""): string {
  if (chapterSlug) return `${ikiruPublicBase()}/manga/${slug}/${chapterSlug}`;
  return `${ikiruPublicBase()}/manga/${slug}/chapter-${chapterNumber}`;
}

export function deriveFormat(raw: string): [string, string] {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key || ["manhwa", "manhwa_scan", "project", "comic"].includes(key)) return ["manhwa", "KR"];
  if (["manhua", "manju"].includes(key)) return ["manhua", "CN"];
  if (["manga", "novel", "novel_manga"].includes(key)) return ["manga", "JP"];
  return ["manhwa", "KR"];
}

export function stripHtmlIkiru(input: string | null | undefined): string {
  return stripHtml(input);
}
