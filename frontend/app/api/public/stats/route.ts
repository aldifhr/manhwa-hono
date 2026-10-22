export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  backendUrl,
  TIMEOUT,
  errorResponse,
  catchError,
} from "@/lib/server-api";

export const dynamic = "force-dynamic";

/** Public aggregate stats — no auth (counts only). */
export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${backendUrl()}/api/public/stats`, {
      signal: AbortSignal.timeout(TIMEOUT.SLOW),
      cache: "no-store",
    });
    if (!res.ok) return errorResponse(`Upstream ${res.status}`, res.status);
    return NextResponse.json(await res.json(), {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (e) {
    return catchError(e);
  }
}
