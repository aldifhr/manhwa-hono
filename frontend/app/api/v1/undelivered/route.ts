export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { backendUrl, authHeaders, TIMEOUT, catchError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const hours = request.nextUrl.searchParams.get("hours") || "168";
  const limit = request.nextUrl.searchParams.get("limit") || "100";
  const params = new URLSearchParams({ hours, limit });
  try {
    const res = await fetch(`${backendUrl()}/api/v1/undelivered?${params}`, {
      headers: authHeaders(request as unknown as Request),
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ success: false, error: `Upstream ${res.status}` }));
    return NextResponse.json(body, {
      status: res.ok ? 200 : res.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return catchError(err);
  }
}

export async function POST(request: NextRequest) {
  // Body is forwarded untouched: the backend re-reads the chapter rows from
  // the DB and ignores any title/cover the client supplies, so this carries
  // only chapterUrls.
  const body = await request.text().catch(() => "");
  try {
    const res = await fetch(`${backendUrl()}/api/v1/undelivered/resend`, {
      method: "POST",
      headers: { ...authHeaders(request as unknown as Request), "Content-Type": "application/json" },
      body: body || "{}",
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
    });
    const data = await res.json().catch(() => ({ success: false }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return catchError(err);
  }
}