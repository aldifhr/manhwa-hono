export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";
import { CSRF_COOKIE, LEGACY_CSRF_COOKIE, LEGACY_SESSION_COOKIE } from "@/lib/cookies";

async function handleLogout(_request: Request) {
  // Backend tidak punya handler logout. JWT stateless,
  // clear cookie di FE sudah cukup.

  const response = NextResponse.json({ success: true });
  const clearOpts = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  // clear host-only (current) + legacy domain cookie from previous none+domain fix
  response.cookies.set(COOKIE_NAME, "", { ...clearOpts, httpOnly: true });
  response.cookies.set(COOKIE_NAME, "", { ...clearOpts, httpOnly: true, domain: ".aldifhr.my.id" });
  response.cookies.set(CSRF_COOKIE, "", { ...clearOpts, httpOnly: false });
  response.cookies.set(CSRF_COOKIE, "", { ...clearOpts, httpOnly: false, domain: ".aldifhr.my.id" });
  // also clear none variant if still present
  response.cookies.set(COOKIE_NAME, "", { ...clearOpts, httpOnly: true, sameSite: "none" as const, secure: true, domain: ".aldifhr.my.id" });
  response.cookies.set(CSRF_COOKIE, "", { ...clearOpts, httpOnly: false, sameSite: "none" as const, secure: true, domain: ".aldifhr.my.id" });
  // Pre-rename cookies. The backend dual-reads the old session name, so these
  // must be cleared too or a stale session survives logout.
  response.cookies.set(LEGACY_SESSION_COOKIE, "", { ...clearOpts, httpOnly: true });
  response.cookies.set(LEGACY_SESSION_COOKIE, "", { ...clearOpts, httpOnly: true, domain: ".aldifhr.my.id" });
  response.cookies.set(LEGACY_CSRF_COOKIE, "", { ...clearOpts, httpOnly: false });
  response.cookies.set(LEGACY_CSRF_COOKIE, "", { ...clearOpts, httpOnly: false, domain: ".aldifhr.my.id" });
  response.cookies.set(LEGACY_SESSION_COOKIE, "", { ...clearOpts, httpOnly: true, sameSite: "none" as const, secure: true, domain: ".aldifhr.my.id" });
  response.cookies.set(LEGACY_CSRF_COOKIE, "", { ...clearOpts, httpOnly: false, sameSite: "none" as const, secure: true, domain: ".aldifhr.my.id" });
  // Ensure caches don't retain auth'd responses after logout
  response.headers.set("Clear-Site-Data", '"cookies"');
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  return handleLogout(request);
}

export async function GET(request: Request) {
  return handleLogout(request);
}
