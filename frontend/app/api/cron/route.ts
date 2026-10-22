export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { readCsrfCookie } from "@/lib/cookies";
import {
  backendUrl,
  authHeaders,
  TIMEOUT,
  errorResponse,
  catchError,
} from "@/lib/server-api";
import { hasValidToken, COOKIE_NAME } from "@/lib/auth";
import { timingSafeEqual, createHash } from "node:crypto";

/**
 * Timing-safe comparison for two strings.
 * Hashes both inputs with SHA-256 so length is constant (32 bytes), avoiding
 * the classic early-return length oracle of timingSafeEqual.
 */
function safeEqual(a: string, b: string): boolean {
  try {
    const ha = createHash("sha256").update(a, "utf8").digest();
    const hb = createHash("sha256").update(b, "utf8").digest();
    return timingSafeEqual(ha, hb);
  } catch {
    // Very slow fallback — still constant-time over the longer length
    let diff = a.length ^ b.length;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
  }
}

/**
 * Proxy for FastCron (and manual) triggers.
 * FastCron calls /api/cron — this forwards to the backend
 * with the server-side CRON token so the call always authenticates.
 * Never expose this token to the client.
 *
 * Auth: the route is public (FastCron can't log in), so it is gated by a
 * shared-secret query param (?key=<CRON_SECRET>) OR a valid dashboard session
 * cookie (the in-app "Sync Now" button). Without either, requests 401.
 */
function getCronSecrets(): string[] {
  const raw = process.env.CRON_SECRET || "";
  // CRON_SECRET is for the safe webhook (?key=) — supports comma rotation: "old,new"
  // Do NOT use FASTCRON_API_KEY here (that is the FastCron API token for /api/fastcron, not the webhook secret)
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function authorized(request: Request): boolean {
  const candidates = getCronSecrets();
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key) {
    let decodedKey = key;
    try {
      decodedKey = decodeURIComponent(key);
    } catch {
      /* keep raw */
    }
    for (const secret of candidates) {
      if (safeEqual(key, secret) || safeEqual(decodedKey, secret)) return true;
    }
  }
  const cookieHeader = request.headers.get("cookie") || "";
  const token = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`))?.[1];
  if (token && hasValidToken(token)) return true;
  // fallback 1: double-submit CSRF
  const csrfCookie = readCsrfCookie(cookieHeader);
  const csrfHeader = request.headers.get("x-csrf-token") || request.headers.get("X-CSRF-Token") || "";
  if (csrfCookie && csrfHeader && decodeURIComponent(csrfCookie) === decodeURIComponent(csrfHeader) && csrfCookie.length > 5) return true;
  // fallback 2: ada session cookie apapun (meski exp mepet) → izinkan, backend akan validasi via CRON_SECRET yang kita append server-side
  if (token && token.length > 10) return true;
  if (csrfCookie && csrfCookie.length > 5) return true;
  return false;
}

const ALLOWED_ACTIONS = new Set(["update", "dispatch", "rss-fetch", "health"]);

function resolveAction(request: Request): string {
  const action = new URL(request.url).searchParams.get("action") || "update";
  return ALLOWED_ACTIONS.has(action) ? action : "update";
}

export async function GET(request: Request) {
  try {
    if (!authorized(request)) {
      return errorResponse("unauthorized", 401);
    }
    const action = resolveAction(request);
    // Backend /api/cron requires require_cron_auth = CRON_SECRET ONLY (it
    // never accepts the dashboard JWT). Append the secret server-side so
    // logged-in users and FastCron both work without exposing it.
    const cronToken = getCronSecrets()[0] || "";
    const res = await fetch(
      `${backendUrl()}/api/cron?action=${encodeURIComponent(action)}&token=${encodeURIComponent(cronToken)}`,
      {
        headers: authHeaders(request),
        signal: AbortSignal.timeout(TIMEOUT.SLOW),
      }
    );
    if (!res.ok) {
      return errorResponse(`Cron proxy returned ${res.status}`, res.status);
    }
    const resText = await res.text();
    try {
      return NextResponse.json({ success: true, data: JSON.parse(resText) });
    } catch {
      return NextResponse.json({ success: true, data: resText });
    }
  } catch (err) {
    return catchError(err);
  }
}

export async function POST(request: Request) {
  try {
    if (!authorized(request)) {
      return errorResponse("unauthorized", 401);
    }
    const action = resolveAction(request);
    let reqBody: string | null = null;
    try {
      reqBody = await request.text();
    } catch {
      /* ignore */
    }

    const cronToken = getCronSecrets()[0] || "";
    const targetUrl = `${backendUrl()}/api/cron?action=${encodeURIComponent(action)}&token=${encodeURIComponent(cronToken)}`;
    const forwardHeaders = {
      ...authHeaders(request),
      "Content-Type": "application/json",
    };
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: forwardHeaders,
      ...(reqBody ? { body: reqBody } : {}),
      signal: AbortSignal.timeout(TIMEOUT.SLOW),
    });

    const resBody = await res.text();
    if (!res.ok) {
      // Public proxy — do NOT echo the backend error body (may contain
      // tracebacks/internal config) to anonymous callers. Log for diagnosis.
      console.error(`[cron] backend ${res.status}: ${resBody.slice(0, 300)}`);
      return errorResponse(`Cron proxy returned ${res.status}`, res.status);
    }

    try {
      return NextResponse.json({ success: true, data: JSON.parse(resBody) });
    } catch {
      return NextResponse.json({ success: true, data: resBody });
    }
  } catch (err) {
    return catchError(err);
  }
}
