import type { FlatChapter } from "@/lib/feed";

export function normalizeTitleKey(k: string | null | undefined): string {
  if (!k) return "";
  return String(k)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function coverPriority(source: string): number {
  // Lower wins. Shinigami serves stable cover URLs; voratoon's are on a
  // separate CDN but are equally stable, so it ranks second only as a
  // tie-breaker, not as a fallback for broken images.
  const s = (source || "").toLowerCase();
  if (s === "shinigami") return 0;
  if (s === "voratoon") return 1;
  return 10;
}
function isPresignedCoverExpired(cover: string): boolean {
  if (!cover) return false;
  const m = cover.match(/X-Amz-Date=([^&]+).*?X-Amz-Expires=(\d+)/);
  if (!m) return false;
  try {
    const d = m[1]; // 20260828T025606Z
    const exp = parseInt(m[2], 10);
    const dt = new Date(
      d.slice(0, 4) +
        "-" +
        d.slice(4, 6) +
        "-" +
        d.slice(6, 11) +
        ":" +
        d.slice(11, 13) +
        ":" +
        d.slice(13, 15) +
        "Z"
    );
    const expiry = dt.getTime() + exp * 1000;
    return Date.now() > expiry - 24 * 3600 * 1000; // treat as expired if <24h left
  } catch {
    return false;
  }
}

interface GroupedChapter {
  /** unique key per chapter+source */
  key: string;
  chapter: string;
  chapterLabel: string;
  chapterNumber: number;
  titleKey: string;
  url: string;
  chapterUrl: string;
  source: string;
  sentAt: string;
  createdAt: string;
  seriesUrl: string;
  isSent?: boolean;
  isWhitelisted: boolean;
}

export interface GroupedSeries {
  titleKey: string;
  title: string;
  cover: string;
  origin: string;
  type?: string | null;
  seriesUrl: string;
  rating?: string | number | null;
  genres?: string[];
  description?: string | null;
  /**
   * True when ANY source in the group is whitelisted. Kept for the filters and
   * counters that ask "is this series tracked at all".
   *
   * Do NOT use this to decide whether to show the Add button — a series carried
   * by two sources where only one is whitelisted would then hide the button for
   * the other, which is exactly the bug this field caused. Use
   * `whitelistedSources` per source instead.
   */
  isWhitelisted: boolean;
  /** Every source that has a chapter in this group. */
  sources: string[];
  /** The subset of `sources` that is whitelisted. */
  whitelistedSources: string[];
  sentAt?: string;
  chapters: GroupedChapter[];
}

/** Group flat RSS rows. Group key is normalized titleKey (dash/space/case) so the SAME title
 *  from multiple sources merges into ONE card
 *  with merged chapters. Cover priority: shinigami. */
export function groupChapters(items: FlatChapter[] | null | undefined): GroupedSeries[] {
  const safeItems = Array.isArray(items) ? items : [];
  const map = new Map<string, GroupedSeries>();
  const coverSource = new Map<string, string>();
  // dedup: normalized group key + source + chapter (chapter may be undefined, fall back to chapterLabel/number)
  const seenChapters = new Map<string, Set<string>>();
  for (const it of safeItems) {
    const tk = (it.titleKey ?? "") as string;
    const gk = normalizeTitleKey(tk); // dedup across dash/space/case/uuid
    if (!gk) continue;
    // chapter dedup key uses normalized group key so "Solo-Leveling" vs "solo leveling" doesn't duplicate
    const chapId = `${(it.source || "").toLowerCase()}:${String(it.chapter ?? it.chapterLabel ?? it.chapterNumber ?? it.url ?? "")}`;
    const seen = seenChapters.get(gk);
    if (seen?.has(chapId)) continue;
    let g = map.get(gk);
    if (!g) {
      g = {
        titleKey: tk,
        title: it.title,
        cover: it.cover,
        origin: (it as unknown as { country?: string | null }).country ?? it.origin,
        type: (it as unknown as { format?: string | null }).format ?? (it as unknown as { type?: string | null }).type ?? null,
        seriesUrl: it.seriesUrl,
        rating: it.rating,
        genres: it.genres,
        description: it.description,
        isWhitelisted: it.isWhitelisted,
        sources: it.source ? [it.source] : [],
        whitelistedSources: it.isWhitelisted && it.source ? [it.source] : [],
        chapters: [],
      };
      map.set(gk, g!);
      if (it.cover) coverSource.set(gk, it.source);
    } else {
      // keep type if missing (for flag visibility)
      const itFmt = (it as unknown as { format?: string | null }).format ?? (it as unknown as { type?: string | null }).type;
      if (!g!.type && itFmt) g!.type = itFmt;
    }
    g!.chapters.push({
      key: `${gk}:${chapId}:${it.chapterUrl || it.url || ""}`,
      titleKey: tk,
      chapter: it.chapter,
      chapterLabel: it.chapterLabel,
      chapterNumber: it.chapterNumber,
      url: it.url,
      chapterUrl: it.chapterUrl,
      source: it.source,
      sentAt: it.sentAt,
      createdAt: it.createdAt,
      seriesUrl: it.seriesUrl,
      isSent: it.isSent,
      isWhitelisted: it.isWhitelisted,
    });
    // track dedup
    if (!seenChapters.has(gk)) seenChapters.set(gk, new Set());
    seenChapters.get(gk)!.add(chapId);
    // Per-source tracking. `isWhitelisted` stays a group-wide OR (filters and
    // counters read it), but `whitelistedSources` is what the card renders —
    // a series whitelisted on shinigami must still offer Add for its voratoon
    // chapters.
    if (it.source && !g!.sources.includes(it.source)) g!.sources.push(it.source);
    if (it.isWhitelisted) {
      g!.isWhitelisted = true;
      if (it.source && !g!.whitelistedSources.includes(it.source)) {
        g!.whitelistedSources.push(it.source);
      }
    }
    // prefer first non-empty description/rating/genres (RSS may have empty desc on one source)
    if (!g!.description && it.description) g!.description = it.description;
    if ((!g!.rating || g!.rating === "") && it.rating) g!.rating = it.rating;
    if ((!g!.genres || g!.genres.length === 0) && it.genres?.length)
      g!.genres = it.genres;
    // keep latest sentAt for label rendering
    if (
      it.sentAt &&
      (!g!.sentAt ||
        new Date(it.sentAt).getTime() > new Date(g!.sentAt).getTime())
    )
      g!.sentAt = it.sentAt;
    // cover priority: shinigami. Expired presigned covers are skipped.
    const curPri = g!.cover ? coverPriority(coverSource.get(gk) || "") : 99;
    const newPri = coverPriority(it.source);
    const curExpired = isPresignedCoverExpired(g!.cover);
    const newExpired = isPresignedCoverExpired(it.cover || "");
    if (
      it.cover &&
      (!g!.cover || curExpired || (!newExpired && newPri < curPri))
    ) {
      coverSource.set(gk, it.source);
      g!.cover = it.cover;
      if (it.seriesUrl) g!.seriesUrl = it.seriesUrl;
      // also adopt title from higher priority source if available
      if (it.title && newPri < curPri) g!.title = it.title;
    }
  }
  // Sort chapters within a group by chapter number desc (newest first)
  const out = [...map.values()];
  for (const g of out) {
    g.chapters.sort((a, b) => b.chapterNumber - a.chapterNumber);
  }
  return out;
}

/**
 * True when the series has a chapter newer than the given cutoff.
 *
 * Pass `Date.now() - N * 3600_000` for a rolling window. AllTab passes the
 * previous-visit timestamp instead, so "new" means "released since you were
 * last here" rather than "released today" — the nav badge counts that same
 * window via /api/v1/rss/new?since=.
 */
export function seriesHasNewSince(series: GroupedSeries, cutoffMs: number): boolean {
  for (const ch of series.chapters) {
    const t = ch.sentAt ? Date.parse(ch.sentAt) : NaN;
    if (!isNaN(t) && t >= cutoffMs) return true;
  }
  return false;
}

export function seriesHasNewWithin(series: GroupedSeries, hours = 24): boolean {
  return seriesHasNewSince(series, Date.now() - hours * 3600 * 1000);
}
