import { SESSION_COOKIE } from "@/lib/cookies";

const COOKIE_NAME = SESSION_COOKIE;

function b64UrlDecode(input: string): string {
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  try {
    if (typeof atob === "function") return atob(b64);
  } catch {}
  try {
    const buf = (
      globalThis as {
        Buffer?: {
          from: (str: string, enc: string) => { toString: () => string };
        };
      }
    ).Buffer;
    if (buf) return buf.from(b64, "base64").toString();
  } catch {}
  return "";
}

function decodeJwtPayload<T>(token: string): T | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = b64UrlDecode(payload);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function hasValidToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) return false;
  const payload = decodeJwtPayload<{ exp?: number }>(token);
  if (!payload || !payload.exp) return false;
  return Date.now() < payload.exp * 1000;
}

export { COOKIE_NAME };
