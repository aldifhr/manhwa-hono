export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/cookies";
import {
  backendUrl,
  TIMEOUT,
  errorResponse,
  catchError,
  authHeaders,
  hashSession,
} from "@/lib/server-api";
import { rssItemSchema } from "@/lib/schemas";
import { normalizeOrigin } from "@/lib/constants";
import { rssCache } from "@/lib/cache";

// Force this route to be dynamic — Vercel's CDN will otherwise cache the
// JSON response (the handler below doesn't set Cache-Control: no-store, so
// Vercel defaults to a long-lived cache) and /recent shows frozen data
// forever even though the backend updates every cron tick.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Use centralized backendUrl so BACKEND_URL override applies to RSS too.
// RSS_API_URL kept as optional override for legacy envs; otherwise derive from backendUrl().
function rssBaseUrl(): string {
  const override = process.env.RSS_API_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  return `${backendUrl()}/api/v1/rss`;
}

function cacheKey(
  session: string,
  page: string,
  limit: number,
  group: string,
  source: string,
  whitelist: string,
  exclude: string,
  type: string
) {
  return `rss:${session}:${page}:${limit}:${group}:${source}:${whitelist}:${exclude}:${type}`;
}

export async function GET(request: NextRequest) {
  // Key the cache by session so one user's authed response is never served
  // to another (cross-user data leak).
  const session =
    readSessionCookie(request.headers.get("cookie") || "") || "anon";
  const page = String(
    Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("page")) || 1, 1),
      1000
    )
  );
  const limit = request.nextUrl.searchParams.get("limit") || "500";
  const source = (request.nextUrl.searchParams.get("source") || "")
    .trim()
    .slice(0, 50);
  const whitelist = request.nextUrl.searchParams.get("whitelist") || "";
  const groupRaw = request.nextUrl.searchParams.get("group") ?? "false";
  // Accept both spellings. `group=1` was silently treated as false, which meant
  // grouped callers got a flat payload with no error to explain it.
  const group = groupRaw === "true" || groupRaw === "1" ? "true" : "false";
  const exclude = (request.nextUrl.searchParams.get("exclude") || "")
    .trim()
    .slice(0, 100);
  const type = (request.nextUrl.searchParams.get("type") || "")
    .trim()
    .toLowerCase()
    .slice(0, 20);
  const clampedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  // Cek cache dulu — hash session biar JWT tidak bocor di memory
  const key = cacheKey(
    hashSession(session),
    page,
    clampedLimit,
    group,
    source,
    whitelist,
    exclude,
    type
  );
  // 10s TTL cache: absorbs repeat page loads + protects the backend from
  // redundant cold-start hits (which caused intermittent 504s).
  const cached = rssCache.get(key);
  if (cached)
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        "Vary": "Cookie",
      },
    });

  try {
    const params = new URLSearchParams({
      format: "json",
      page,
      limit: String(clampedLimit),
      group,
    });
    if (source) params.set("source", source);
    if (whitelist === "true") params.set("whitelist", "true");
    if (exclude) params.set("exclude", exclude);
    if (type) { params.set("type", type); params.set("format", type); }

    const res = await fetch(`${rssBaseUrl()}?${params}`, {
      headers: authHeaders(request),
      signal: AbortSignal.timeout(TIMEOUT.RSS),
      cache: "no-store",
    });

    // Surface real upstream failures instead of a generic 500. Do NOT echo the
    // upstream body — it may contain tracebacks/internal config.
    if (!res.ok) {
      const status = res.status >= 500 ? 502 : res.status; // 5xx upstream -> 502
      return errorResponse(`Upstream ${res.status}`, status);
    }

    let body: Record<string, unknown>;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      return errorResponse("Upstream returned non-JSON body", 502);
    }

    const data = body.data as Record<string, unknown> | undefined;
    const results = data?.results as Array<Record<string, unknown>> | undefined;

    // Grouped mode: BE returns series with nested chapters array — don't run flat rssItemSchema (it strips `chapters`)
    if (group === "true" && data && results) {
      // Keep grouped shape as-is, only filter JP at series level if needed
      let grouped = results;
      const wantsJapan =
        source.toLowerCase() === "japanese" ||
        source.toLowerCase() === "jp" ||
        exclude.toLowerCase().includes("japanese");
      if (!wantsJapan) {
        grouped = grouped.filter(
          (r) =>
            normalizeOrigin((r as { origin?: string }).origin ?? "") !==
            "japanese"
        );
      }
      data.results = grouped;
    } else if (data && results) {
      // Flat mode: validate + normalize each row with zod (snake_case → camelCase, cover URL rewrite, url/chapterUrl fallbacks, coerced chapterNumber).
      let parseFailures = 0;
      let normalized = results.map((item) => {
        const parsed = rssItemSchema.safeParse(item);
        if (!parsed.success) {
          parseFailures++;
          return item as Record<string, unknown>;
        }
        return parsed.data as unknown as Record<string, unknown>;
      });
      if (parseFailures > 0) {
        console.warn(
          `[rss] ${parseFailures}/${results.length} rows failed schema validation`
        );
      }
      // Note: JP stripping disabled — user wants to see all origins
      // (Sovereign Of A Hundred Blades is JP but user wants it visible)
      // Ensure stable DESC sort by createdAt (BE was not strictly sorted, causing pagination inversions).
      normalized.sort((a, b) => {
        const ta = Date.parse((a as { createdAt?: string }).createdAt ?? "");
        const tb = Date.parse((b as { createdAt?: string }).createdAt ?? "");
        if (isNaN(ta) && isNaN(tb)) return 0;
        if (isNaN(ta)) return 1;
        if (isNaN(tb)) return -1;
        return tb - ta;
      });
      data.results = normalized;
    }

    if (!body.success) {
      return errorResponse(
        String(body.error ?? "Upstream returned error"),
        400
      );
    }

    rssCache.set(key, body);
    // Publik tapi per-session (cookies ikut) → private, tidak share antar user via CDN
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        "Vary": "Cookie",
      },
    });
  } catch (err) {
    // Timeout / network error from the upstream fetch.
    if (err instanceof Error && err.name === "TimeoutError") {
      return errorResponse("Upstream timed out", 504);
    }
    return catchError(err);
  }
}
