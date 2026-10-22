/**
 * CSRF protection helper — reads the CSRF cookie set by the
 * backend on login and attaches it as an `X-CSRF-Token` header on every
 * mutating request (POST / PUT / DELETE / PATCH).
 *
 * Safe methods (GET / HEAD / OPTIONS) are NOT affected.
 */
import { CSRF_COOKIE as CSRF_COOKIE_NAME } from "@/lib/cookies";

const CSRF_COOKIE = CSRF_COOKIE_NAME;
const CSRF_HEADER = "X-CSRF-Token";

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  try {
    const escaped = CSRF_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
    const raw = match ? decodeURIComponent(match[2]) : "";
    // guard: token "undefined"/"null"/empty harus dianggap kosong (bug lama kirim header "undefined")
    if (!raw || raw === "undefined" || raw === "null" || raw.length < 5) return "";
    return raw;
  } catch {
    return "";
  }
}

/**
 * Attach CSRF header to a fetch RequestInit.
 * Only adds the header for mutating methods — safe methods are left untouched.
 */
export function withCsrf(init: RequestInit = {}): RequestInit {
  const base: RequestInit = { ...init, credentials: "include" as RequestCredentials };
  const method = (base.method ?? "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return base;

  const token = getCsrfToken();
  // merge headers handling Headers instance / array — jangan pernah kirim "undefined"
  const headers = new Headers(base.headers as HeadersInit | undefined);
  if (token && token !== "undefined" && token.length > 5) headers.set(CSRF_HEADER, token);
  return { ...base, headers };
}
