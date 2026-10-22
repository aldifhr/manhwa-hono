export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { backendUrl, authHeaders, TIMEOUT, catchError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token =
      process.env.API_TOKEN ||
      process.env.NEXT_PUBLIC_API_TOKEN ||
      "manhwascan";
    const res = await fetch(`${backendUrl()}/api/v1/health/detailed`, {
      headers: {
        ...authHeaders(request),
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
      cache: "no-store",
    });
    const body = await res
      .json()
      .catch(() => ({ success: false, error: `Upstream ${res.status}` }));
    return NextResponse.json(body, {
      status: res.ok ? 200 : res.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return catchError(err);
  }
}
