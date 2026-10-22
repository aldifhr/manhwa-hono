/**
 * Deep module Cover — single seam for cover URL resolution.
 * LRU via Map, direct-host bypass, rewrites legacy cover-img → proxy/cover.
 */

const COVER_CACHE = new Map<string, string | null>();
const COVER_CACHE_MAX = 200;
function putCover(key: string, val: string | null): string | null {
  COVER_CACHE.set(key, val);
  if (COVER_CACHE.size > COVER_CACHE_MAX) {
    const first = COVER_CACHE.keys().next().value as string | undefined;
    if (first !== undefined) COVER_CACHE.delete(first);
  }
  return val;
}

const DIRECT_HOSTS = new Set([
  "minio.imgkc1.my.id",
  "imgkc1.my.id",
  "assets.shngm.id",
]);
export function isDirectAllowed(hostname: string): boolean {
  return DIRECT_HOSTS.has(hostname);
}
export function toProxy(url: string): string {
  return `/api/v1/reader/proxy?url=${encodeURIComponent(url)}`;
}

// Extract inner URL from any cover-img form: /cover-img?url=… or ?series=…
function extractCoverImgInner(
  cover: string
): { inner: string; param: string } | null {
  if (!cover.includes("cover-img?")) return null;
  try {
    const u = new URL(cover, "https://manhwa.aldifhr.my.id");
    const inner = u.searchParams.get("url") || u.searchParams.get("series");
    if (!inner) return null;
    const param = u.searchParams.has("url") ? "url" : "series";
    return { inner, param };
  } catch {
    return null;
  }
}
function canonicalForCoverImg(param: string): string {
  return param === "url" ? "/api/v1/reader/proxy" : "/api/v1/reader/cover";
}

export function resolveCoverUrl(
  cover: string | null | undefined
): string | null {
  if (!cover) return null;
  const cached = COVER_CACHE.get(cover);
  if (cached !== undefined) return cached;

  // 1. Already canonical local path (not cover-img) → keep
  if (cover.startsWith("/api/v1/reader/cover") && !cover.includes("cover-img?"))
    return putCover(cover, cover);

  // 2. Any cover-img form → rewrite to canonical proxy/cover (direct hosts stay as-is)
  const img = extractCoverImgInner(cover);
  if (img) {
    if (img.inner.includes("/api/v1/reader/proxy?url=")) return putCover(cover, img.inner);
    return putCover(
      cover,
      `${canonicalForCoverImg(img.param)}?${img.param}=${encodeURIComponent(img.inner)}`
    );
  }
  // Local prefix variant "/api/v1/reader/cover-img?url=" without host
  const COVER_IMG_PREFIX = "/api/v1/reader/cover-img?url=";
  if (cover.startsWith(COVER_IMG_PREFIX)) {
    const inner = decodeURIComponent(cover.slice(COVER_IMG_PREFIX.length));
    if (inner.includes("/api/v1/reader/proxy?url=")) return putCover(cover, inner);
    return putCover(
      cover,
      `/api/v1/reader/proxy?url=${encodeURIComponent(inner)}`
    );
  }

  // 3. Backend-host absolute URL → strip to local path (handles scanner/manhwa + envHost)
  const backendHosts = ["scanner.aldifhr.my.id", "manhwa.aldifhr.my.id"]
  try {
    const envHost = (
      typeof process !== "undefined"
        ? process.env.NEXT_PUBLIC_API_BASE || process.env.BACKEND_URL || ""
        : ""
    ) as string;
    if (envHost) {
      const h = new URL(envHost).hostname;
      if (h && !backendHosts.includes(h)) backendHosts.push(h);
    }
  } catch {}
  for (const host of backendHosts) {
    for (const proto of ["https://", "http://"]) {
      const prefix = `${proto}${host}/api/v1/reader/`;
      if (cover.startsWith(prefix))
        return putCover(cover, cover.slice(`${proto}${host}`.length));
    }
  }
  // Generic absolute URL containing /api/v1/reader/ → strip to path
  if (cover.includes("/api/v1/reader/")) {
    try {
      const u = new URL(cover);
      if (u.pathname.startsWith("/api/v1/reader/"))
        return putCover(cover, u.pathname + u.search);
    } catch {}
  }

  // 4. Proxy prefix: normalize double-encode, direct hosts bypass proxy
  const PROXY_PREFIX = "/api/v1/reader/proxy?url=";
  const LEGACY_IMG_PREFIX = "/api/img?url=";
  for (const prefix of [PROXY_PREFIX, LEGACY_IMG_PREFIX, "/api/v1/img?url="]) {
    if (cover.startsWith(prefix)) {
      const inner = decodeURIComponent(cover.slice(prefix.length));
      let raw = inner;
      try {
        if (/%[0-9A-Fa-f]{2}/.test(inner) && !inner.startsWith("http"))
          raw = decodeURIComponent(inner);
      } catch {}
      try {
        const rawHost = new URL(raw).hostname;
        if (isDirectAllowed(rawHost) && !raw.includes("X-Amz-")) return putCover(cover, raw);
      } catch {}
      return putCover(cover, `${PROXY_PREFIX}${encodeURIComponent(raw)}`);
    }
  }

  if (!/^https?:\/\//.test(cover)) return putCover(cover, null);

  // 5. Unwrap nested proxy wrapper if present
  let rawUrl = cover;
  if (cover.includes("/api/v1/reader/proxy?")) {
    try {
      const u = new URL(cover, "https://example.com");
      const inner = u.searchParams.get("url");
      if (inner)
        rawUrl = cover.startsWith("http") ? inner : decodeURIComponent(inner);
    } catch {}
  }
  if (!/^https?:\/\//.test(rawUrl)) return putCover(cover, null);

  let host = "";
  try {
    host = new URL(rawUrl).hostname;
  } catch {}
  if (isDirectAllowed(host)) return putCover(cover, rawUrl);
  return putCover(cover, toProxy(rawUrl));
}

export const rewriteCoverUrl = resolveCoverUrl;
export function _clearCoverCache(): void {
  COVER_CACHE.clear();
}
