/**
 * Title and chapter normalisation.
 *
 * Ported 1:1 from app/utils/text.py and app/services/fcfs.py. These functions
 * decide whether a scraped chapter matches a whitelist entry and whether two
 * sources are announcing the same chapter, so they are the highest-risk code
 * in the port: a subtle difference here means notifications silently stop (or
 * double) rather than erroring.
 *
 *   normalizeTitleKey("Bizarre  Restaurant!") === "bizarre restaurant"
 *   slugifyTitleKey("Bizarre  Restaurant!")  === "bizarre-restaurant"
 *
 * The DB stores title_key WITH SPACES. Slugs (dashes) are only for URL paths.
 * Mixing the two is the classic bug: whitelist matching silently returns
 * nothing and chapters are never dispatched.
 */

/** Decode the handful of HTML entities the sources actually emit. */
function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number.parseInt(code, 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const n = Number.parseInt(code, 16);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : "";
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Canonical normalised title key: lowercase, alphanumeric plus single spaces.
 *
 * This is the ONLY implementation. Every whitelist match and every dedupe
 * comparison goes through it.
 */
export function normalizeTitleKey(title: string | null | undefined): string {
  if (!title) return "";
  const lowered = decodeEntities(String(title).toLowerCase());
  // Python's re.sub(r"[^a-z0-9]+", " ", t) — runs of non-alphanumerics
  // collapse to ONE space, so "a  -  b" becomes "a b".
  const spaced = lowered.replace(/[^a-z0-9]+/g, " ");
  return spaced.replace(/\s+/g, " ").trim();
}

/** URL/path-safe variant: dashes instead of spaces. */
export function slugifyTitleKey(title: string | null | undefined): string {
  return normalizeTitleKey(title).replace(/ /g, "-");
}

/** Inverse of slugifyTitleKey: URL path -> DB title_key. */
export function deslugifyTitleKey(slug: string | null | undefined): string {
  if (!slug) return "";
  return slug.replace(/-/g, " ").trim();
}

/**
 * Canonical chapter token for dedupe.
 *
 *   12.50 -> "12.5"   160-2 -> "160.2"   012 -> "12"
 *   "OVA" -> "OVA"    (non-numeric kept verbatim, case preserved)
 *
 * The `-` -> `.` mapping is what makes "160-2" and "160.2" collapse to the
 * same key; without it a source that uses hyphens for split chapters would
 * look like a different chapter from one that uses dots.
 */
export function normalizeChapter(ch: string | number | null | undefined): string {
  const s = String(ch ?? "").trim();
  if (!s) return s;
  const m = /^(\d+)(?:[.\-](\d+))?$/.exec(s);
  if (!m) return s;
  const whole = Number.parseInt(m[1] as string, 10);
  const frac = m[2];
  if (frac === undefined) return String(whole);
  // Strip trailing zeros from the fraction, then reattach.
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : String(whole);
}

/**
 * FCFS key: title + chapter, deliberately SOURCE-AGNOSTIC.
 *
 * Two sources reporting the same chapter produce the same key, so whichever
 * arrives first wins and the other is deduped. This is why the whitelist
 * match is also cross-source — the two have to agree.
 */
export function fcfsKey(
  title: string | null | undefined,
  chapter: string | number | null | undefined,
): string {
  const t = slugifyTitleKey(title);
  const c = normalizeChapter(chapter);
  return `${t}|${c}`;
}

/** Strip HTML tags and collapse whitespace (for descriptions from sources). */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  return decodeEntities(String(input).replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse an ISO timestamp into epoch milliseconds, or null if unusable. */
export function parseTs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  if (!s) return null;
  // Date.parse handles "2026-10-06T16:03:18.585Z" and "...+00:00".
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/** ISO-8601 UTC string, the format every timestamp column stores. */
export function nowIso(): string {
  return new Date().toISOString();
}

export function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * ikiru labels WIB wall-clock (UTC+7) as if it were UTC.
 *
 * Parsing naively puts every chapter 7 hours in the FUTURE, and a future
 * timestamp fails the freshness window, so the whole feed silently vanishes.
 * Shift back by the offset after parsing.
 */
const IKIRU_TZ_OFFSET_H = 7;

export function parseIkiruTs(value: unknown): number | null {
  const ms = parseTs(value);
  if (ms === null) return null;
  return ms - IKIRU_TZ_OFFSET_H * 3600 * 1000;
}

/** Truncate to a max length, appending an ellipsis when cut. */
export function truncate(input: string, max: number): string {
  const s = String(input ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Escape Discord markdown so a title with `*` or `_` cannot break the embed. */
export function escapeDiscordMd(input: string): string {
  return String(input ?? "").replace(/([\\*_~`|>])/g, "\\$1");
}
