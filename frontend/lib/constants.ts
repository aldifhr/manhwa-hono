/** Every ACTIVE source, in display order.
 *  Single source of truth for filter chips and anything that enumerates
 *  sources — the backend already answers /api/v1/sources for dynamic cases.
 *
 *  Must match `settings.SOURCE_KEYS` in the backend. A source listed here that
 *  the backend does not collect renders a filter chip that can only ever return
 *  an empty list. */
export const ALL_SOURCES = ["shinigami", "voratoon", "ikiru"] as const;
export type SourceName = (typeof ALL_SOURCES)[number];

/** Normalize backend origin names → canonical frontend names.
 *  Handles both country codes (KR/JP/CN) and source slugs (manhwa/manga/manhua).
 *  Single source of truth — do NOT re-implement in components. */
export function normalizeOrigin(origin: string | null | undefined): string {
  const v = (origin || "").toUpperCase();
  if (v === "KR" || v === "MANHWA") return "korean";
  if (v === "JP" || v === "MANGA") return "japanese";
  if (v === "CN" || v === "MANHUA") return "chinese";
  return (origin || "").toLowerCase();
}

const ORIGIN_FLAG: Record<string, string> = {
  korean: "/kr.png",
  japanese: "/jp.png",
  chinese: "/cn.png",
  manhwa: "/kr.png",
  manga: "/jp.png",
  manhua: "/cn.png",
};

export function getOriginFlag(origin: string | null | undefined): string {
  if (!origin) return "";
  return ORIGIN_FLAG[normalizeOrigin(origin)] ?? "";
}

