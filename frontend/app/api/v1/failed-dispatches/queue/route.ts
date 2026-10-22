export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { backendUrl, authHeaders, TIMEOUT, catchError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${backendUrl()}/api/v1/failed-dispatches/queue`, {
      headers: authHeaders(request as unknown as Request),
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ success: false, error: `Upstream ${res.status}` }));
    return NextResponse.json(body, { status: res.ok ? 200 : res.status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return catchError(err);
  }
}
