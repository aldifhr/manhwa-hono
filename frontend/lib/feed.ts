// Reusable feed domain — single source for FlatChapter + helpers
// Deep module seam: AllTab, Home, Group, Reader share this.

export interface FlatChapter {
  title: string;
  titleKey: string;
  canonicalTitleKey?: string;
  isSent?: boolean;
  chapter: string;
  chapterLabel: string;
  chapterNumber: number;
  url: string;
  chapterUrl: string;
  source: string;
  cover: string;
  origin: string;
  country?: string | null;
  type?: string | null;
  format?: string | null;
  seriesUrl: string;
  rating?: string | number | null;
  genres?: string[];
  isWhitelisted: boolean;
  createdAt: string;
  sentAt: string;
  description?: string | null;
}

export const KNOWN_ORIGINS = ["korean", "japanese", "chinese"] as const;

export const KNOWN_TYPES = ["manhwa", "manhua", "manga"] as const;
export const NO_TYPE = "no_type" as const;

export function normalizeType(t: unknown): string {
  const v = String(t ?? "").trim().toLowerCase();
  if (v === "mangatoon" || v === "manga") return "manga";
  if ((KNOWN_TYPES as readonly string[]).includes(v)) return v;
  return NO_TYPE;
}
export function typeLabel(t: string): string {
  if (t === "manhwa") return "Manhwa";
  if (t === "manhua") return "Manhua";
  if (t === "manga") return "Manga";
  return "No Type";
}

export function resolveSeriesUrl(c: FlatChapter): string {
  return c.seriesUrl || c.chapterUrl;
}

export function compareFlatByNewest(a: FlatChapter, b: FlatChapter): number {
  const ta = (a as any)?.createdAt ? Date.parse((a as any).createdAt) : 0;
  const tb = (b as any)?.createdAt ? Date.parse((b as any).createdAt) : 0;
  if (tb !== ta) return tb - ta;
  const aKey = (a as any)?.titleKey ?? "";
  const bKey = (b as any)?.titleKey ?? "";
  if (aKey !== bKey) return String(aKey).localeCompare(String(bKey));
  return String((a as any)?.chapterUrl || (a as any)?.url || "").localeCompare(
    String((b as any)?.chapterUrl || (b as any)?.url || "")
  );
}

export function chapterKey(c: FlatChapter): string {
  if (!c) return "";
  return `${(c as any).titleKey ?? ""}:${(c as any).source ?? ""}:${(c as any).chapterUrl || (c as any).url || (c as any).chapter || ""}`;
}
