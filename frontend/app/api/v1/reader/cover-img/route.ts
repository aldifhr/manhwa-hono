export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { authHeaders, backendUrl, TIMEOUT, catchError } from "@/lib/server-api";
import { getFresh, getStale, setCache, coalesceFetch, type ResolvedResult } from "@/lib/image-cache";
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const series = request.nextUrl.searchParams.get("series");
  const key = url ? `cover-img:url:${url}` : `cover-img:series:${series}`;
  const target = url ? `${backendUrl()}/api/v1/reader/cover-img?url=${encodeURIComponent(url!)}` : `${backendUrl()}/api/v1/reader/cover-img?series=${encodeURIComponent(series!)}`;
  try {
    if (!url && !series) return new NextResponse("Missing url or series", { status: 400 });
    const cached = getFresh(key);
    if (cached) return new NextResponse(new Blob([cached.data]), { status: 200, headers: { "Content-Type": cached.contentType, "Cache-Control": "private, max-age=300", "X-Cache": "HIT" } });
    const result: ResolvedResult = await coalesceFetch(key, async () => {
      const res = await fetch(target, { headers: authHeaders(request), signal: AbortSignal.timeout(TIMEOUT.COVER) });
      if (!res.ok) return { ok: false, status: res.status };
      const ct = res.headers.get("content-type") || "image/webp";
      const data = await res.arrayBuffer();
      setCache(key, data, ct);
      return { ok: true, data, contentType: ct };
    });
    if (!result.ok) {
      const stale = getStale(key);
      if (stale) return new NextResponse(new Blob([stale.data]), { status: 200, headers: { "Content-Type": stale.contentType, "Cache-Control": "private, max-age=60", "X-Cache": "STALE" } });
      return new NextResponse(`Upstream ${result.status}`, { status: result.status });
    }
    return new NextResponse(new Blob([result.data!]), { status: 200, headers: { "Content-Type": result.contentType!, "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    const stale = getStale(key);
    if (stale) return new NextResponse(new Blob([stale.data]), { status: 200, headers: { "Content-Type": stale.contentType, "Cache-Control": "private, max-age=60", "X-Cache": "STALE" } });
    return catchError(err);
  }
}
