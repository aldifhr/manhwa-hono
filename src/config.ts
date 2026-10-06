/**
 * Runtime configuration.
 *
 * Everything the Python backend read from `.env` lives here, but the values
 * come from Worker bindings/vars so there is no dotenv step and no secrets in
 * the repo. `wrangler.toml` supplies the non-secret defaults; the Discord
 * webhook is a secret (`wrangler secret put DISCORD_WEBHOOK_URL`).
 */

export interface Env {
  DB: D1Database;

  // Secrets — set with `wrangler secret put <NAME>`.
  DISCORD_WEBHOOK_URL?: string;
  ADMIN_REPORT_WEBHOOK_URL?: string;
  CRON_SECRET?: string;
  MONITOR_AUTH_TOKEN?: string;

  // Non-secret vars, with defaults below.
  DISCORD_CHANNEL_IDS?: string;
  VORATOON_PROXY_URL?: string;
  SCRAPE_FRESH_WINDOW_HOURS?: string;
  DISABLED_SOURCES?: string;
  ENVIRONMENT?: string;
}

/** Upstream endpoints. Kept in one place so a source move is a one-line edit. */
export const SOURCES = {
  shinigami: {
    api: "https://api.shngm.io/v1",
    public: "https://11.shinigami.asia",
    seriesPath: "/series/",
  },
  voratoon: {
    api: "https://api.voratoon.com",
    public: "https://v4.voratoon.com",
  },
  ikiru: {
    api: "https://09.ikiru.wtf",
    public: "https://09.ikiru.wtf",
  },
} as const;

export type SourceKey = keyof typeof SOURCES;

export const SOURCE_KEYS: SourceKey[] = ["shinigami", "voratoon", "ikiru"];

/**
 * A browser UA is not optional. Both ikiru and voratoon sit behind Cloudflare,
 * and the default `Cloudflare-Workers` UA is challenged outright.
 */
export const HTTP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Discord embed colours, matching the frontend's source palette. */
export const SOURCE_COLORS: Record<string, number> = {
  shinigami: 0xef4444, // red-500
  voratoon: 0xf97316, // orange-500
  ikiru: 0x22c55e, // green-500
};

export const SOURCE_LABELS: Record<string, string> = {
  shinigami: "Shinigami",
  voratoon: "Voratoon",
  ikiru: "Ikiru",
};

/** Fallback colour for an unknown source (grey-500). */
export const DEFAULT_COLOR = 0x95a5a6;

/** Freshness window: chapters older than this are not announced. */
export const FRESH_WINDOW_HOURS = 24;

/** A parked send waits this long before its next retry attempt. */
export const RETRY_BACKOFF_MS = 5 * 60 * 1000;

/** An in-flight dispatch claim is considered dead after this long. */
export const CLAIM_TTL_MS = 15 * 60 * 1000;

export function freshWindowHours(env: Env): number {
  const raw = Number.parseInt(env.SCRAPE_FRESH_WINDOW_HOURS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : FRESH_WINDOW_HOURS;
}

export function disabledSources(env: Env): Set<string> {
  const out = new Set<string>();
  for (const part of (env.DISABLED_SOURCES ?? "").split(",")) {
    const s = part.trim().toLowerCase();
    if (s) out.add(s);
  }
  return out;
}

export function discordChannelIds(env: Env): string[] {
  return (env.DISCORD_CHANNEL_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Base URL for the voratoon egress proxy.
 *
 * api.voratoon.com is blocked at Cloudflare's edge for the VPS's IP, so
 * voratoon is unreachable directly from a self-hosted runner. A Worker runs on
 * Cloudflare's own network and reaches it fine. This is the ONLY source that
 * needs the detour.
 */
export function voratoonProxyBase(env: Env): string | null {
  const raw = (env.VORATOON_PROXY_URL ?? "").trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}
