export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/cookies";
import {
  backendUrl,
  authHeaders,
  TIMEOUT,
  errorResponse,
  catchError,
  hashSession,
} from "@/lib/server-api";
import { rewriteCoverUrl } from "@/lib/utils";
import { whitelistCache } from "@/lib/cache";

interface CatalogItem {
  title: string;
  titleKey: string;
  cover: string;
  sources: { source: string; url: string }[];
  metadata: {
    rating: string;
    genres: string[];
    description: string;
    origin?: string;
  };
  latestChapter: {
    number: number;
    url: string;
    sentAt: string;
    source: string;
  } | null;
}

interface WhitelistBackendItem {
  id?: string;
  title_key?: string;
  canonical_title_key?: string;
  title: string;
  cover?: string | null;
  seriesUrl?: string;
  series_url?: string;
  source?: string;
  sources?: string[] | { source: string; url: string }[];
  source_urls?: Record<string, string>;
  url?: string;
  origin?: string | null;
  // The backend whitelist row carries `format` (manhwa|manhua|manga) and
  // `country` (KR|CN|JP) — NOT `type`/`origin`. Reading only the latter made
  // both fields null on every row, so the /whitelist type filter matched nothing.
  format?: string | null;
  country?: string | null;
  type?: string | null;
  description?: string | null;
  rating?: string | number | null;
  genres?: string[];
  chapterLabel?: string;
  chapterNumber?: number;
  chapter_number?: number;
  last_chapter?: number | string | null;
  latest_sent_chapter?: number | string | null;
  latest_chapter?: number | string | null;
  last_notified?: string | null;
  lastNotified?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  time?: string | null;
  updated_at?: string | null;
  chapters?: unknown[];
}

interface CatalogData {
  results: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface BackendResponse {
  success: boolean;
  data: CatalogData;
  error?: { code: string; message: string };
}

export async function GET(request: NextRequest) {
  // Key the cache by session so one user's authed response is never served
  // to another — hash JWT biar tidak bocor di memory.
  const rawSession =
    readSessionCookie(request.headers.get("cookie") || "") || "anon";
  const session = hashSession(rawSession);
  const page = String(
    Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("page")) || 1, 1),
      1000
    )
  );
  // Clamp page_size (1..10000) so an authed client can't request page_size=1e6.
  const pageSize = String(
    Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("page_size")) || 20, 1),
      10000
    )
  );
  const merge = (
    request.nextUrl.searchParams.get("merge") || "true"
  ).toLowerCase();
  const mergeParam =
    merge === "false" || merge === "0" || merge === "no" ? "false" : "true";
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  const cacheKeyStr = `whitelist:${session}:${page}:${pageSize}:${q}:${mergeParam}`;
  const cached = whitelistCache.get(cacheKeyStr);
  if (cached)
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": "private, no-store, must-revalidate",
        Vary: "Cookie",
        Pragma: "no-cache",
      },
    });

  try {
    const params = new URLSearchParams({
      page,
      page_size: pageSize,
      merge: mergeParam,
    });
    if (q) params.set("q", q);

    const res = await fetch(`${backendUrl()}/api/whitelist?${params}`, {
      headers: authHeaders(request),
      signal: AbortSignal.timeout(TIMEOUT.WHITELIST),
      cache: "no-store",
    });

    let body: Record<string, unknown>;
    try {
      body = await res.json();
    } catch {
      body = {};
    }

    if (!res.ok) {
      const errObj = body as { error?: unknown };
      const msg =
        typeof errObj?.error === "string"
          ? errObj.error
          : `Upstream ${res.status}`;
      return errorResponse(msg, res.status);
    }

    // Backend /api/whitelist may return either shape:
    //   1) Node:    { success: true, data: { results: [...], total, page, pageSize, totalPages } }
    //   2) FastAPI: { status: "ok", whitelist: [...], total?, page?, page_size?, total_pages? }
    const dataObj = body.data as
      | {
          results?: WhitelistBackendItem[];
          total?: number;
          page?: number;
          pageSize?: number;
          totalPages?: number;
        }
      | null
      | undefined;
    const fastObj = body as {
      whitelist?: unknown;
      total?: number;
      page?: number;
      page_size?: number;
      total_pages?: number;
    };
    const isNodeShape = !!dataObj && Array.isArray(dataObj.results);
    const isFastApiShape = Array.isArray(fastObj.whitelist);

    const items: WhitelistBackendItem[] = isNodeShape
      ? (dataObj.results ?? [])
      : isFastApiShape
        ? ((fastObj.whitelist as WhitelistBackendItem[]) ?? [])
        : [];

    const total = isNodeShape
      ? dataObj.total
      : isFastApiShape
        ? fastObj.total
        : undefined;
    const backendPage = isNodeShape
      ? dataObj.page
      : isFastApiShape
        ? fastObj.page
        : undefined;
    const backendPageSize = isNodeShape
      ? dataObj.pageSize
      : isFastApiShape
        ? fastObj.page_size
        : undefined;
    const backendTotalPages = isNodeShape
      ? dataObj.totalPages
      : isFastApiShape
        ? fastObj.total_pages
        : undefined;

    const mapped = items.map((item: WhitelistBackendItem) => {
      // BE now returns sources as string[] + source_urls map (aeb05c8). Normalize to {source,url}[] for FE.
      let normalizedSources: { source: string; url: string }[] = [];
      if (Array.isArray(item.sources)) {
        if (item.sources.length > 0 && typeof item.sources[0] === "string") {
          const urls = item.source_urls || {};
          normalizedSources = (item.sources as string[]).map((s) => ({
            source: s,
            url: urls[s] || item.series_url || item.url || "",
          }));
        } else {
          normalizedSources = item.sources as { source: string; url: string }[];
        }
      } else if (item.source && item.url) {
        normalizedSources = [{ source: item.source, url: item.url }];
      } else if (item.source && item.source_urls?.[item.source]) {
        normalizedSources = [
          { source: item.source, url: item.source_urls[item.source] },
        ];
      }
      // chapterNumber: only numeric values, ignore date strings like last_chapter="2026-08-22..." (BE now uses time field for date)
      const rawChapter =
        item.chapterNumber ??
        item.chapter_number ??
        item.latest_sent_chapter ??
        item.latest_chapter;
      const chapterNumber =
        typeof rawChapter === "number"
          ? rawChapter
          : typeof rawChapter === "string" && /^\d+(\.\d+)?$/.test(rawChapter)
            ? Number(rawChapter)
            : undefined;
      return {
        // Prefer title_key as the id: the backend now returns a UUID `id`, but
        // remove/undo/titleKey logic in WhitelistGrid keys off title_key.
        id: item.title_key || item.id,
        title: item.title,
        titleKey: item.title_key || item.id || "",
        canonical_title_key:
          (item as unknown as { canonical_title_key?: string })
            .canonical_title_key || null,
        canonicalTitleKey:
          (item as unknown as { canonical_title_key?: string })
            .canonical_title_key || null,
        cover: rewriteCoverUrl(item.cover),
        seriesUrl: item.seriesUrl || item.series_url || null,
        source: item.source || normalizedSources[0]?.source || "",
        sources: normalizedSources.map((s) => s.source),
        url: item.url || normalizedSources[0]?.url || "",
        // BE row carries `format`/`country`; accept `type`/`origin` too for
        // callers that already normalized. Never emit null when format exists.
        origin: item.origin || item.country || null,
        type: item.type || item.format
          ? String(item.type || item.format).toLowerCase()
          : null,
        description: item.description || null,
        rating: item.rating || null,
        genres: item.genres || [],
        chapterLabel:
          item.chapterLabel ||
          (chapterNumber ? `Ch. ${chapterNumber}` : undefined),
        chapterNumber: chapterNumber || undefined,
        lastNotified: item.last_notified || item.lastNotified || null,
        createdAt: item.created_at || item.createdAt || null,
        time: item.time || item.updated_at || null,
        chapters: item.chapters || [],
      } as Record<string, unknown> & {
        titleKey: string;
        createdAt: string | null;
        sources: string[];
      };
    });

    // BE now dedups canonical_title_key server-side (aeb05c8) — 137 unique.
    // Keep stable DESC sort as defense-in-depth; BE already ORDER BY created_at DESC.
    const results = [...mapped].sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt as string) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt as string) : 0;
      if (tb !== ta) return tb - ta;
      return (a.titleKey as string).localeCompare(b.titleKey as string);
    });

    const responseBody = {
      success: true,
      data: {
        results,
        total: total ?? results.length,
        page: backendPage ?? Number(page),
        pageSize: backendPageSize ?? Number(pageSize),
        totalPages:
          backendTotalPages ??
          Math.max(1, Math.ceil((total ?? results.length) / Number(pageSize))),
      },
    };
    whitelistCache.set(cacheKeyStr, responseBody);
    return NextResponse.json(responseBody, {
      headers: {
        "Cache-Control": "private, no-store, must-revalidate",
        Vary: "Cookie",
        Pragma: "no-cache",
      },
    });
  } catch (err) {
    return catchError(err);
  }
}

export async function POST(request: NextRequest) {
  const { handleWhitelistPost } = await import("@/lib/server/whitelist");
  return handleWhitelistPost(request);
}

export async function DELETE(request: NextRequest) {
  const { handleWhitelistDelete } = await import("@/lib/server/whitelist");
  return handleWhitelistDelete(request);
}
