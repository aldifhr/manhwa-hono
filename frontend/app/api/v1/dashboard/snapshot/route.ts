export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { backendUrl, authHeaders, TIMEOUT, catchError } from "@/lib/server-api";

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${backendUrl()}/api/v1/dashboard-snapshot`, {
      headers: authHeaders(request),
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
    });
    if (!res.ok) {
      // anon hit backend lama yang masih require auth → jangan 401 spam, return 200 null biar FE silent
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { success: true, data: null },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      return NextResponse.json(
        { success: false, error: `Upstream ${res.status}` },
        { status: res.status }
      );
    }
    const body = await res.json();
    return NextResponse.json(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // network/timeout untuk anon → silent null juga
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("403")) {
      return NextResponse.json(
        { success: true, data: null },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    return catchError(err);
  }
}
