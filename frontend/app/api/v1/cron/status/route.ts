export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/server-api";

// Force dynamic — the VPS /cron monitor page polls this for live scheduler
// state; we must never let the CDN cache it.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const upstream = `${backendUrl()}/api/cron/status`;
    const res = await fetch(upstream, {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: `cron status proxy failed: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 502 }
    );
  }
}
