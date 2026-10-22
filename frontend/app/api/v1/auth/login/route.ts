export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { CSRF_COOKIE, LEGACY_CSRF_COOKIE, LEGACY_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/cookies";
import { backendUrl } from "@/lib/server-api";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    if (!password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }
    const BACKEND_URL = backendUrl();
    const res = await fetch(`${BACKEND_URL}/api/v1/auth?action=login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success || !json.data?.ok) {
      const backendMsg =
        (json as { message?: string; error?: string | { message?: string } })?.message ||
        (typeof json.error === "string" ? json.error : (json.error as { message?: string } | undefined)?.message);
      return NextResponse.json({ error: backendMsg || "Invalid credentials" }, { status: 401 });
    }
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const findSetCookie = (name: string, legacy: string) => {
      const pair = setCookies
        .map((c) => c.split(";")[0])
        .find((c) => c.startsWith(`${name}=`) || c.startsWith(`${legacy}=`));
      return pair ? pair.split("=").slice(1).join("=") : "";
    };
    // Accept the pre-rename name too, in case the backend is one deploy behind.
    const backendJwtValue = findSetCookie(SESSION_COOKIE, LEGACY_SESSION_COOKIE);
    const csrfTokenValue = findSetCookie(CSRF_COOKIE, LEGACY_CSRF_COOKIE);
    const response = NextResponse.json({ success: true });
    if (backendJwtValue) {
      const isProd = process.env.NODE_ENV === "production";
      // host-only lax for same-site (Brave/Incognito tidak blok 3rd-party)
      response.cookies.set(SESSION_COOKIE, backendJwtValue, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
      if (csrfTokenValue) {
        response.cookies.set(CSRF_COOKIE, csrfTokenValue, {
          httpOnly: false,
          secure: isProd,
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 60 * 60,
        });
      }
      // domain .aldifhr.fun + SameSite none untuk cross-subdomain (manhwa -> scanner via server-side forward
      // butuh fallback jika FE di-cached cross-site). Set tambahan, tidak replace host-only.
      if (isProd) {
        response.cookies.set(SESSION_COOKIE, backendJwtValue, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          domain: ".aldifhr.my.id",
          path: "/",
          maxAge: 7 * 24 * 60 * 60,
        });
        if (csrfTokenValue) {
          response.cookies.set(CSRF_COOKIE, csrfTokenValue, {
            httpOnly: false,
            secure: true,
            sameSite: "none",
            domain: ".aldifhr.my.id",
            path: "/",
            maxAge: 7 * 24 * 60 * 60,
          });
        }
      }
      return response;
    }
    return NextResponse.json({ error: "Backend did not issue a session cookie" }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
