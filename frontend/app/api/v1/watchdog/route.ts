export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/cookies";
import { backendUrl } from "@/lib/server-api";

// Live dispatch-lag state; never let the CDN cache it.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The backend requires monitor auth on /api/v1/watchdog. We forward the
 * dashboard session cookie rather than injecting a shared secret: the FE
 * never holds MONITOR_AUTH_TOKEN, so there is no second copy of a long-lived
 * credential to leak. The backend validates the JWT itself.
 */
export async function GET(req: NextRequest) {
  try {
    const window = req.nextUrl.searchParams.get("window");
    const qs = window ? `?window=${encodeURIComponent(window)}` : "";
    const cookie =
    req.cookies.get(SESSION_COOKIE)?.value ??
    req.cookies.get(LEGACY_SESSION_COOKIE)?.value;
    if (!cookie) {
      return NextResponse.json(
        { success: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE}=${cookie}`,
    };
    const auth = req.headers.get("authorization");
    if (auth) headers.Authorization = auth;

    const res = await fetch(`${backendUrl()}/api/v1/watchdog${qs}`, {
      cache: "no-store",
      headers,
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
        success: false,
        error: `watchdog proxy failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      },
      { status: 502 }
    );
  }
}
