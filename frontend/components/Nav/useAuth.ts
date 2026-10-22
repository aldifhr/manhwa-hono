"use client";
import { withCsrf } from "@/lib/csrf";
import {
  CSRF_COOKIE,
  LEGACY_CSRF_COOKIE,
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
} from "@/lib/cookies";

function clearClientCookies() {
  // Fallback client-side clear — ensures UI flips even if Set-Cookie from
  // server is ignored (e.g., Secure mismatch on http localhost).
  try {
    const opts = "path=/; Max-Age=0; SameSite=Lax";
    const clear = (name: string, domain?: string) => {
      document.cookie = domain
        ? `${name}=; ${opts}; domain=${domain}`
        : `${name}=; ${opts}`;
    };
    // Both the current and the pre-rename names, on host-only and on the
    // shared domain. The backend still dual-reads the old name, so leaving it
    // behind would keep the session alive after logout.
    for (const name of [
      SESSION_COOKIE,
      LEGACY_SESSION_COOKIE,
      CSRF_COOKIE,
      LEGACY_CSRF_COOKIE,
    ]) {
      clear(name);
      clear(name, ".aldifhr.my.id");
    }
  } catch {}
}

export function useAuth() {
  const logout = async () => {
    try {
      await fetch("/api/v1/auth/logout", withCsrf({ method: "POST", credentials: "include" as RequestCredentials }));
    } catch {}
    try { localStorage.removeItem("alltab-ui"); } catch {}
    clearClientCookies();
    window.location.replace("/login");
    setTimeout(() => { if (window.location.pathname !== "/login") window.location.href = "/login"; }, 500);
  };
  return { logout };
}
