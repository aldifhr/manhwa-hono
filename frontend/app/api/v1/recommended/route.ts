export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { backendUrl, TIMEOUT, errorResponse, catchError } from "@/lib/server-api";

export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get("limit") || "10";
  const url = `${backendUrl()}/api/v1/recommended?limit=${encodeURIComponent(limit)}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
      cache: "no-store",
    });
    if (!res.ok) return errorResponse(`Upstream ${res.status}`, res.status >= 500 ? 502 : res.status);
    const body = await res.json();
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") return errorResponse("Upstream timed out", 504);
    return catchError(err);
  }
}
