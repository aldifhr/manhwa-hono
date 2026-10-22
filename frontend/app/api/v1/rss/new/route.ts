export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  TIMEOUT,
  errorResponse,
  catchError,
  authHeaders,
  backendUrl,
} from "@/lib/server-api";

function rssBaseUrl(): string {
  const override = process.env.RSS_API_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  return `${backendUrl()}/api/v1/rss`;
}

// Lightweight proxy for the backend's /api/rss/new?since=<unix_ms> endpoint.
// Returns { success, data: { since, newCount, latestUpdatedTime } } so the
// banner count is a single request instead of walking every feed page.
// ?distinct=title → count unique titles (distinct titleKey) instead of chapters.
export async function GET(request: NextRequest) {
  const since = request.nextUrl.searchParams.get("since");
  const distinct = request.nextUrl.searchParams.get("distinct") ?? "title";
  const group = request.nextUrl.searchParams.get("group");
  try {
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    params.set("distinct", distinct);
    if (group) params.set("group", group);

    const res = await fetch(`${rssBaseUrl()}/new?${params}`, {
      headers: authHeaders(request),
      signal: AbortSignal.timeout(TIMEOUT.SLOW),
    });

    if (!res.ok) {
      const status = res.status >= 500 ? 502 : res.status;
      // Do NOT echo the upstream body — it may contain tracebacks/internal config.
      return errorResponse(`Upstream ${res.status}`, status);
    }

    let body: Record<string, unknown>;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      return errorResponse("Upstream returned non-JSON body", 502);
    }

    // Always serve the unified { success, data } shape, regardless of whether
    // the backend wraps its payload the same way.
    if (!body.success) {
      const msg =
        typeof body.error === "string" ? body.error : `Upstream ${res.status}`;
      return errorResponse(msg, res.ok ? 502 : res.status);
    }
    // Accept both backend shapes: { success, data: {...} } and a flat
    // { success, newCount, ... } — always serve the unified { success, data }.
    const wrapped =
      body.data && typeof body.data === "object"
        ? (body.data as Record<string, unknown>)
        : body;
    return NextResponse.json({ success: true, data: wrapped });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return errorResponse("Upstream timed out", 504);
    }
    return catchError(err);
  }
}
