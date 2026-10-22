export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/server-api";

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${backendUrl()}/api/v1/cron/health`, {
      cache: "no-store",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
        authorization: req.headers.get("authorization") ?? "",
      },
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    return NextResponse.json({ error: `cron health proxy failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
