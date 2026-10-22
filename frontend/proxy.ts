import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, hasValidToken } from "@/lib/auth";
import { getSecurityHeaders } from "@/lib/security/headers";

function applySecurityHeaders(res: NextResponse): NextResponse {
  const headers = getSecurityHeaders(process.env.NODE_ENV === "development");
  for (const [k, v] of Object.entries(headers)) {
    res.headers.set(k, v);
  }
  return res;
}

const PUBLIC_EXACT = new Set<string>([
  "/",
  "/recent",
  "/about",
  "/login",
  "/sw.js",
  "/manifest.json",
  "/icon.svg",
  "/favicon.ico",
  "/cn.png",
  "/jp.png",
  "/kr.png",
]);

const PUBLIC_PREFIX = [
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/auth/me",
  "/api/v1/cron",
  "/api/v1/reader/rss",
  "/api/v1/reader/rss/new",
  "/api/v1/reader/proxy",
  "/api/v1/reader/cover",
  "/api/v1/reader/cover-img",
  "/api/v1/reader/activity",
  "/api/v1/public/stats",
  "/api/v1/recommended",
  "/api/v1/rss",
  "/api/v1/rss/new",
  "/api/reader/rss",
  "/api/reader/rss/new",
  "/api/reader/proxy",
  "/api/reader/cover",
  "/api/reader/cover-img",
  "/api/reader/activity",
  "/api/cron",
];

const PUBLIC_GET_PREFIX = [
  "/api/v1/reader/whitelist",
  "/api/v1/whitelist",
  "/api/v1/stats",
  "/api/v1/queue",
  "/api/v1/dashboard",
  "/api/reader/whitelist",
];

function isPublicPath(pathname: string, method: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  const isGet = method === "GET" || method === "HEAD";
  if (
    isGet &&
    PUBLIC_GET_PREFIX.some(
      (p) =>
        pathname === p ||
        pathname.startsWith(p + "/") ||
        pathname.startsWith(p + "?")
    )
  )
    return true;
  return PUBLIC_PREFIX.some(
    (p) =>
      pathname === p ||
      pathname.startsWith(p + "/") ||
      pathname.startsWith(p + "?")
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (token && hasValidToken(token)) {
      const raw = request.nextUrl.searchParams.get("redirect");
      const redirect =
        raw && raw.startsWith("/") && !raw.startsWith("//") && !/^(?:javascript|data|vbscript):/i.test(raw) ? raw : "/";
      return applySecurityHeaders(NextResponse.redirect(new URL(redirect, request.url)));
    }
    return applySecurityHeaders(NextResponse.next());
  }

  if (isPublicPath(pathname, request.method)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token || !hasValidToken(token)) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        NextResponse.json(
          { success: false, error: "unauthorized" },
          { status: 401 }
        )
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
