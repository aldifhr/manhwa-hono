export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { authHeaders, backendUrl, TIMEOUT, catchError } from "@/lib/server-api";
import { getFresh, getStale, setCache, coalesceFetch, type ResolvedResult } from "@/lib/image-cache";

// FE handler for /api/v1/reader/proxy?url= — direct FE→BE proxy, no Vercel rewrite needed
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url");
    if (!url) return new NextResponse("Missing url", { status: 400 });
    const cacheKey = `proxy:${url}`;
    const cached = getFresh(cacheKey);
    if (cached) {
      return new NextResponse(new Blob([cached.data]), {
        status: 200,
        headers: { "Content-Type": cached.contentType, "Cache-Control": "private, max-age=300", "X-Cache": "HIT" },
      });
    }
    const result: ResolvedResult = await coalesceFetch(cacheKey, async () => {
      const res = await fetch(`${backendUrl()}/api/v1/reader/proxy?url=${encodeURIComponent(url)}`, {
        headers: authHeaders(request),
        signal: AbortSignal.timeout(TIMEOUT.COVER),
      });
      if (!res.ok) return { ok: false, status: res.status };
      const contentType = res.headers.get("content-type") || "image/webp";
      const data = await res.arrayBuffer();
      setCache(cacheKey, data, contentType);
      return { ok: true, data, contentType };
    });
    if (!result.ok) {
      const stale = getStale(cacheKey);
      if (stale) return new NextResponse(new Blob([stale.data]), { status: 200, headers: { "Content-Type": stale.contentType, "Cache-Control": "private, max-age=60", "X-Cache": "STALE" } });
      return new NextResponse(`Upstream ${result.status}`, { status: result.status });
    }
    return new NextResponse(new Blob([result.data!]), { status: 200, headers: { "Content-Type": result.contentType!, "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    const url = request.nextUrl.searchParams.get("url") ?? "";
    const stale = getStale(`proxy:${url}`);
    if (stale) return new NextResponse(new Blob([stale.data]), { status: 200, headers: { "Content-Type": stale.contentType, "Cache-Control": "private, max-age=60", "X-Cache": "STALE" } });
    if (err instanceof Error && err.name === "TimeoutError") return new NextResponse("Upstream proxy timed out", { status: 504 });
    return catchError(err);
  }
}
