export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { backendUrl, TIMEOUT, catchError } from "@/lib/server-api";

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${backendUrl()}/api/v1/public/stats`, {
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ success: false, error: `Upstream ${res.status}` }, { status: res.ok ? 200 : res.status, headers: { "Cache-Control": "no-store" } });
    const body = await res.json();
    return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } });
  } catch (err) {
    return catchError(err);
  }
}
