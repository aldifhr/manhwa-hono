export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { authHeaders, backendUrl, TIMEOUT, catchError } from "@/lib/server-api";
import {
  getFresh,
  getStale,
  setCache,
  coalesceFetch,
  type ResolvedResult,
} from "@/lib/image-cache";

// Same-origin cover proxy under /api/v1/reader/cover.
// The backend emits cover as `/api/reader/cover?series=<slug>` (no upstream host exposed, BE-3c).
// The browser loads this same-origin path; we forward it to the backend WITH the session cookie.
export async function GET(request: NextRequest) {
  try {
    const series = request.nextUrl.searchParams.get("series");
    if (!series) {
      return new NextResponse("Missing series", { status: 400 });
    }

    const cacheKey = `cover:${series}`;

    // 1. Fresh cache hit
    const cached = getFresh(cacheKey);
    if (cached) {
      return new NextResponse(new Blob([cached.data]), {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "private, max-age=300",
          "X-Cache": "HIT",
        },
      });
    }

    // 2. Coalesced fetch
    const result: ResolvedResult = await coalesceFetch(cacheKey, async () => {
      const res = await fetch(
        `${backendUrl()}/api/v1/reader/cover?series=${encodeURIComponent(series)}`,
        {
          headers: authHeaders(request),
          signal: AbortSignal.timeout(TIMEOUT.COVER),
        }
      );
      if (!res.ok) {
        return { ok: false, status: res.status };
      }
      const contentType = res.headers.get("content-type") || "image/webp";
      const data = await res.arrayBuffer();
      setCache(cacheKey, data, contentType);
      return { ok: true, data, contentType };
    });

    // 3. Error → stale or fail
    if (!result.ok) {
      const stale = getStale(cacheKey);
      if (stale) {
        console.warn(`[cover] ${result.status} for ${series} — serving stale`);
        return new NextResponse(new Blob([stale.data]), {
          status: 200,
          headers: {
            "Content-Type": stale.contentType,
            "Cache-Control": "private, max-age=60",
            "X-Cache": "STALE",
          },
        });
      }
      return new NextResponse(`Upstream ${result.status}`, {
        status: result.status,
      });
    }

    // 4. Success
    return new NextResponse(new Blob([result.data!]), {
      status: 200,
      headers: {
        "Content-Type": result.contentType!,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const series = request.nextUrl.searchParams.get("series") ?? "";
    const stale = getStale(`cover:${series}`);
    if (stale) {
      console.warn(`[cover] Fetch error — serving stale for ${series}`);
      return new NextResponse(new Blob([stale.data]), {
        status: 200,
        headers: {
          "Content-Type": stale.contentType,
          "Cache-Control": "private, max-age=60",
          "X-Cache": "STALE",
        },
      });
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return new NextResponse("Upstream cover timed out", { status: 504 });
    }
    return catchError(err);
  }
}
