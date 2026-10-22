import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names (clsx) and de-duplicate Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Return `url` only if it is a safe http(s) href, else `null`.
 * Guards against `javascript:`/`data:`/`vbscript:` scheme injection from
 * backend-supplied values (React does not sanitize `href` schemes).
 */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Resolve the numeric/display part of a chapter label using a fallback chain:
 * chapterLabel (stripped of prefix) → chapterNumber → chapter → url → "?".
 * Callers should prepend their own "Ch." prefix to avoid duplication
 * (e.g. "Ch. 182" from backend + "Ch." in UI = "Ch. Ch. 182").
 * "?" is treated as missing (BE sometimes sends literal "?").
 */
export function getChapterLabel(item: {
  chapterLabel?: string | null;
  chapterNumber?: number | string | null;
  chapter?: string | null;
  url?: string | null;
  chapterUrl?: string | null;
}): string {
  const clean = (v: string) => v.replace(/^(?:Chapter|Ch\.?)\s*/i, "").trim();
  if (item.chapterLabel) {
    const c = clean(item.chapterLabel);
    if (c && c !== "?") return c;
  }
  if (
    item.chapterNumber !== undefined &&
    item.chapterNumber !== null &&
    String(item.chapterNumber).trim() !== "" &&
    String(item.chapterNumber) !== "?"
  ) {
    return String(item.chapterNumber).trim();
  }
  if (item.chapter) {
    const c = clean(item.chapter);
    if (c && c !== "?") return c;
  }
  // Fallback: try extract number from url/chapterUrl (e.g. /manga/.../chapter-123/ → 123)
  const url =
    (item as { chapterUrl?: string | null; url?: string | null }).chapterUrl ||
    (item as { url?: string | null }).url ||
    "";
  if (url) {
    try {
      const m =
        url.match(/chapter[^\d]*(\d+(?:\.\d+)?)/i) ||
        url.match(/\/(\d+(?:\.\d+)?)\/?(?:$|\?|#)/);
      if (m?.[1] && m[1] !== "?") return m[1];
    } catch {}
  }
  return "?";
}

/** Decode HTML entities (numeric &#8217; and named &amp;) in API responses */
export function decodeHtml(text: string | null | undefined): string {
  if (text == null) return "";
  if (typeof text !== "string") text = String(text);
  const named: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&#39;": "'",
    "&rsquo;": "\u2019",
    "&lsquo;": "\u2018",
    "&rdquo;": "\u201D",
    "&ldquo;": "\u201C",
    "&ndash;": "\u2013",
    "&mdash;": "\u2014",
    "&hellip;": "\u2026",
    "&nbsp;": " ",
  };
  let out = text;
  for (const [entity, char] of Object.entries(named)) {
    out = out.replaceAll(entity, char);
  }
  out = out.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(Number(code))
  );
  // Hex HTML entities, e.g. &#x20; (space), &#x2019; (right single quote)
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  );
  // Strip any remaining HTML tags (source APIs return <p>/<br> in descriptions)
  out = out.replace(/<[^>]+>/g, " ");
  // Collapse whitespace left by stripped tags
  out = out.replace(/\s+/g, " ").trim();
  // Fix mojibake � (0x92 Windows-1252 ’ mis-decoded as UTF-8) — shinigami titles
  out = out.replace(/\uFFFD/g, "\u2019").replace(/\u0092/g, "\u2019");
  return out;
}

// Re-export cover seam — single source is lib/cover (utils keeps compat)
export {
  resolveCoverUrl as rewriteCoverUrl,
  resolveCoverUrl,
  isDirectAllowed,
  toProxy,
} from "@/lib/cover";
