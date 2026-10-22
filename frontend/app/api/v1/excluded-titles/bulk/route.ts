export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { backendUrl, authHeaders, TIMEOUT, catchError } from "@/lib/server-api";
import { ALL_SOURCES } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { source?: unknown };
    if (
      typeof body.source !== "string" ||
      !(ALL_SOURCES as readonly string[]).includes(body.source)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid source" },
        { status: 400 }
      );
    }
    const res = await fetch(`${backendUrl()}/api/excluded-titles/bulk`, {
      method: "POST",
      headers: { ...authHeaders(request), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
    });
    let respBody: unknown;
    try {
      respBody = await res.json();
    } catch {
      respBody = { success: false, error: `Upstream ${res.status}` };
    }
    return NextResponse.json(respBody, { status: res.ok ? 200 : res.status });
  } catch (err) {
    return catchError(err);
  }
}
