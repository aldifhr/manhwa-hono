export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/cookies";
import {
  backendUrl,
  authHeaders,
  TIMEOUT,
  errorResponse,
  catchError,
} from "@/lib/server-api";

const cache: Map<string, { data: unknown; expiry: number }> = ((
  globalThis as unknown as {
    __rssHealthCache?: Map<string, { data: unknown; expiry: number }>;
  }
).__rssHealthCache ??= new Map());
const CACHE_TTL = 30_000;
const MAX_CACHE = 10;

function getCached(key: string) {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
  if (cache.size > MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

export async function GET(request: Request) {
  try {
    const sessionKey =
      readSessionCookie(request.headers.get("cookie") || "") || "anon";
    const cached = getCached(sessionKey);
    if (cached) return NextResponse.json(cached);

    const res = await fetch(`${backendUrl()}/api/v1/rss/health`, {
      headers: authHeaders(request),
      signal: AbortSignal.timeout(TIMEOUT.RSS),
    });

    if (!res.ok) {
      return errorResponse(
        `RSS health returned ${res.status}`,
        res.status >= 500 ? 502 : res.status
      );
    }

    const body = await res.json();
    setCache(sessionKey, body);
    return NextResponse.json(body);
  } catch (err) {
    return catchError(err);
  }
}
