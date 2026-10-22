export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { backendUrl, authHeaders, TIMEOUT, errorResponse, catchError } from "@/lib/server-api";

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${backendUrl()}/api/openapi.json`, {
      headers: authHeaders(request),
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return errorResponse("Upstream returned non-JSON body", 502);
    }

    if (!res.ok) {
      const msg = typeof (body as { error?: unknown })?.error === "string"
        ? (body as { error: string }).error
        : `Upstream ${res.status}`;
      return errorResponse(msg, res.status);
    }

    return NextResponse.json(body);
  } catch (err) {
    return catchError(err);
  }
}
