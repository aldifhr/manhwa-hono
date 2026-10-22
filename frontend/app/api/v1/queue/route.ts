export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  backendUrl,
  authHeaders,
  TIMEOUT,
  errorResponse,
  catchError,
} from "@/lib/server-api";

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${backendUrl()}/api/failed-dispatches/queue`, {
      headers: authHeaders(request),
      signal: AbortSignal.timeout(TIMEOUT.QUEUE),
    });

    let body: Record<string, unknown>;
    try {
      body = await res.json();
    } catch {
      return errorResponse(`Upstream returned non-JSON body`, 502);
    }

    if (!res.ok || !body.success) {
      const msg =
        typeof body.error === "string" ? body.error : `Upstream ${res.status}`;
      return errorResponse(msg, res.status);
    }

    return NextResponse.json(body);
  } catch (err) {
    return catchError(err);
  }
}
