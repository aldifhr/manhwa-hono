/**
 * Session cookie names and cookie-header parsing.
 *
 * These were originally ikiru_* back when ikiru was one of the scrapers.
 * That source is gone but the names were the live auth contract, so the rename
 * is dual-read: the current name is preferred, the pre-rename name is still
 * accepted. Logging in always issues the current name, so the legacy cookie
 * stops being refreshed and ages out on its own.
 *
 * Drop LEGACY_* from the regexes once no browser can still hold the old names.
 */

export const SESSION_COOKIE = "manhwa_dashboard_session";
export const CSRF_COOKIE = "manhwa_csrf_token";
export const ROLE_COOKIE = "manhwa_role";

export const LEGACY_SESSION_COOKIE = "ikiru_dashboard_session";
export const LEGACY_CSRF_COOKIE = "ikiru_csrf_token";

/** Matches a cookie in a raw Cookie header, current name first. */
function cookieValueRegex(name: string, legacy?: string): RegExp {
  const names = legacy ? `${name}|${legacy}` : name;
  return new RegExp(`(?:^|;\\s*)(?:${names})=([^;]*)`);
}

/** True when either the current or the legacy cookie is present. */
export function hasCookie(header: string, name: string, legacy?: string): boolean {
  return cookieValueRegex(name, legacy).test(header ?? "");
}

export function readSessionCookie(header: string): string {
  return cookieValueRegex(SESSION_COOKIE, LEGACY_SESSION_COOKIE).exec(header ?? "")?.[1] ?? "";
}

export function readCsrfCookie(header: string): string {
  return cookieValueRegex(CSRF_COOKIE, LEGACY_CSRF_COOKIE).exec(header ?? "")?.[1] ?? "";
}

/** Whether a cookie name is set in the browser (value irrelevant). */
export function browserHasCookie(name: string, legacy?: string): boolean {
  if (typeof document === "undefined") return false;
  return hasCookie(document.cookie, name, legacy);
}
