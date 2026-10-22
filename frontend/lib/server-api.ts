import { NextResponse } from "next/server";
import { CSRF_COOKIE, SESSION_COOKIE, readCsrfCookie, readSessionCookie } from "@/lib/cookies";
import { withCsrf } from "@/lib/csrf";

/**
 * Server-side backend URL for FE→backend fetches (proxy/image/auth routes).
 *
 * CRITICAL: must NEVER resolve to `localhost` on the deployed server.
 * `NEXT_PUBLIC_API_BASE` is inlined at BUILD time from the local `.env`
 * (which is `http://localhost:3000` in dev) — if a deploy is built from a
 * machine where that var is localhost, the value gets baked into the server
 * route and every FE→backend fetch throws (→ 502 for all covers/auth).
 *
 * Resolution order:
 *   1. BACKEND_URL  — server-only runtime env, the correct knob for prod.
 *   2. NEXT_PUBLIC_API_BASE — only if it is NOT a localhost address.
 *   3. https://scanner.aldifhr.my.id — safe remote default.
 *
 * NOTE: shared/openapi.json servers[0].url is hardcoded here instead of
 * imported. Importing `@manhwa-scanner/shared` pulls its zod schemas into
 * the client bundle via `export * from "./schemas"` — 484 KB of dead weight
 * for one fallback string. Re-sync if the OpenAPI spec's server URL changes.
 */
export function backendUrl(): string {
  const fromEnv = process.env.BACKEND_URL?.trim();
  if (fromEnv) {
    // BACKEND_URL is server-only runtime env; localhost is expected on VPS prod (127.0.0.1:3000)
    // and also valid in dev. No filtering — return as-is.
    return fromEnv.replace(/\/$/, "");
  }
  const publicBase = process.env.NEXT_PUBLIC_API_BASE;
  if (publicBase && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(publicBase)) {
    return publicBase.replace(/\/$/, "");
  }
  return "https://scanner.aldifhr.my.id";
}

/** @deprecated pakai backendUrl() per-request agar env reload (HMR/Vercel) kebaca. Tetap diekspor untuk compat. */
export const API_BASE = backendUrl();
export function getApiBase(): string {
  return backendUrl();
}
const TOKEN =
  process.env.API_TOKEN || process.env.NEXT_PUBLIC_API_TOKEN || "manhwascan";

if (!TOKEN) {
  console.warn(
    "[server-api] API_TOKEN env not set — backend calls will be unauthenticated unless the session_session cookie is present."
  );
}

export function authHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};

  // Forward ALL cookies to backend — double-submit CSRF requires both the
  // cookie value AND the header value to match.
  const cookie = request.headers.get("cookie") || "";
  const sessionValue = readSessionCookie(cookie);
  const csrfValue = readCsrfCookie(cookie);
  const parts: string[] = [];
  if (sessionValue) parts.push(`${SESSION_COOKIE}=${sessionValue}`);
  if (csrfValue) parts.push(`${CSRF_COOKIE}=${csrfValue}`);
  if (parts.length > 0) headers["Cookie"] = parts.join("; ");

  // Forward CSRF token header for mutating requests.
  const csrfToken = request.headers.get("x-csrf-token") || "";
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  // Fall back to static API_TOKEN only if no session cookie and token present.
  if (!sessionValue && TOKEN) {
    headers["Authorization"] = `Bearer ${TOKEN}`;
  }

  return headers;
}

export function hashSession(session: string): string {
  if (!session || session === "anon") return "anon";
  let h = 0;
  for (let i = 0; i < session.length; i++)
    h = (Math.imul(31, h) + session.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export const TIMEOUT = {
  FAST: 10_000,
  DEFAULT: 30_000,
  SLOW: 45_000,
  RSS: 15_000,
  WHITELIST: 15_000,
  QUEUE: 8_000,
  COVER: 35_000,
} as const;

export function errorResponse(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function refreshSession(): Promise<boolean> {
  // Client-side refresh. Hits the FE proxy route which forwards the
  // session cookie to the backend /api/auth?action=refresh.
  // The backend issues a fresh 7d JWT and Set-Cookies it; the
  // browser stores it automatically.
  try {
    const res = await fetch(
      `/api/reader/auth-refresh`,
      withCsrf({ method: "POST", credentials: "include" as RequestCredentials })
    );
    return res.ok;
  } catch {
    return false;
  }
}

export function catchError(err: unknown) {
  console.error("[api] upstream request failed", err);
  const msg = err instanceof Error ? err.message : String(err);
  const isTimeout =
    msg.includes("Timeout") ||
    (err instanceof Error && err.name === "TimeoutError");
  const detail = isTimeout
    ? "Upstream timed out"
    : `Upstream request failed${msg ? `: ${msg.slice(0, 200)}` : ""}`;
  return errorResponse(detail, isTimeout ? 504 : 502);
}
