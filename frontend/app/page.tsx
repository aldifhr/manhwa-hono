"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { OriginFlag } from "@/components/ui/OriginFlag";
import { CSRF_COOKIE, LEGACY_CSRF_COOKIE, browserHasCookie } from "@/lib/cookies";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { decodeHtml, rewriteCoverUrl, getChapterLabel, safeUrl } from "@/lib/utils";
import { Reader } from "@/lib/reader";
import { readerFetch } from "@/lib/reader/transport";
import {
  Clock,
  TrendUp,
  Star,
  ArrowClockwise,
  BookOpen,
  Compass,
  MagnifyingGlass,
  Plus,
  CheckCircle,
  ArrowsInSimple,
  ArrowsOutSimple,
} from "@phosphor-icons/react";
import { useContinueReading } from "@/lib/continueReading";
import { RecommendedSection } from "@/components/home/RecommendedSection";

import { useReadItems } from "@/components/home/useReadItems";
import { useUiStore } from "@/lib/uiStore";
import { useSourcesHealth, isHealthy } from "@/hooks/useSourcesHealth";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { PageShell } from "@/components/PageShell";
import EmptyState from "@/components/EmptyState";
import { ErrorFallback } from "@/components/ErrorFallback";
import VirtualizedList from "@/components/home/VirtualizedList";
import { groupChapters, type GroupedSeries } from "@/lib/groupChapters";
import { sourceOverlayClass } from "@/lib/styles";
import { queryKeys, staleTimes, gcTimes } from "@/lib/queryKeys";
import { sourceBadgeClass, sourceChapterChipClass } from "@/lib/styles";
import type { FlatChapter } from "@/components/home/AllTab";
import { RatingRow } from "@/components/home/seriesShared";
import { useFeedActions } from "@/components/home/hooks/useFeedActions";

interface FeedResponse {
  success: boolean;
  data: {
    results: unknown[];
    total: number;
    hasMore: boolean;
  };
}

async function fetchFeed(opts?: { signal?: AbortSignal }): Promise<FeedResponse> {
  return readerFetch<FeedResponse>("/api/v1/reader/rss?limit=36&group=false", { signal: opts?.signal });
}

function CoverImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="w-full aspect-3/4 rounded-xl cover-placeholder flex items-center justify-center bg-surface border border-white/6">
        <span className="text-white/30 text-xs tracking-wide">No cover</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-full aspect-3/4 object-cover bg-surface group-hover:scale-[1.03] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
      loading="lazy"
    />
  );
}

function SourcePill({ source }: { source: string }) {
  const s = source?.toLowerCase();
  const cls = sourceBadgeClass(s);
  return (
    <span
      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize backdrop-blur-md border shadow-sm ${cls}`}
    >
      {source}
    </span>
  );
}

function ContinueReadingCard({
  entry,
  onRemove,
}: {
  entry: ReturnType<typeof useContinueReading>["entries"] extends Map<
    string,
    infer V
  >
  ? V
  : never;
  onRemove?: () => void;
}) {
  return (
    <div className="group shrink-0 w-36 sm:w-44 relative">
      {onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove"
          title="Remove"
          className="absolute -right-1 -top-1 z-10 w-6 h-6 rounded-full bg-black/70 border border-white/15 text-white/70 hover:text-white hover:bg-black/90 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
      <a
        href={safeUrl(entry.chapterUrl) || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <div className="relative overflow-hidden rounded-xl card-hover border border-white/8 hover:border-white/15 bg-surface">
          <CoverImage src={entry.cover} alt={decodeHtml(entry.title)} />
          <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          <div className="absolute top-2.5 left-2.5">
            <SourcePill source={entry.source} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black via-black/70 to-transparent pt-6 p-2.5">
            <p className="text-[11px] font-bold tracking-wide text-white">
              Ch. {getChapterLabel({ chapterLabel: entry.lastChapter }) !== "?" ? getChapterLabel({ chapterLabel: entry.lastChapter }) : entry.lastChapter}
            </p>
          </div>
        </div>
      </a>

      <div className="mt-2.5 px-1">
        <h3 className="text-xs sm:text-[13px] font-semibold leading-snug text-white line-clamp-2 min-h-[2.2rem] group-hover:text-white/80 transition-colors">
          {decodeHtml(entry.title)}
        </h3>
        <p className="text-[10px] text-white/45 mt-1 tracking-wide">
          {entry.origin} • {entry.source}
        </p>
      </div>
    </div>
  );
}

function HomeGroupedCard({
  series,
  isWhitelisted,
  adding,
  onAdd,
}: {
  series: GroupedSeries;
  isWhitelisted?: boolean;
  adding?: boolean;
  onAdd?: () => void;
}) {
  // `country` is NULL on every row; OriginFlag falls back to `format`
  // (manhwa / manhua / manga) and owns the country mapping.
  const flagType = ((series as unknown as { format?: string | null }).format ?? series.type ?? "")
    .toString()
    .toLowerCase()
    .trim();
  const health = useSourcesHealth();
  const densityHC = useUiStore((s) => s.density);
  const isCompactHC = densityHC === "compact";
  const prefetch = () => {};
  const [coverSrc, setCoverSrc] = useState(() => rewriteCoverUrl(series.cover));
  const [hasRetried, setHasRetried] = useState(false);
  const [imgErrorFinal, setImgErrorFinal] = useState(false);
  useEffect(() => {
    setCoverSrc(rewriteCoverUrl(series.cover));
    setHasRetried(false);
    setImgErrorFinal(false);
  }, [series.cover]);
  const { trackChapter } = useContinueReading();
  const { readItems, toggleRead } = useReadItems();
  const sCh: GroupedSeries["chapters"] = Array.isArray((series as GroupedSeries)?.chapters) ? (series as GroupedSeries).chapters : [];
  const firstCh = sCh[0] as GroupedSeries["chapters"][number] | undefined;
  const firstSource = firstCh?.source ?? null;
  const sLower = (firstSource || "").toLowerCase();
  const down = firstSource ? !isHealthy(health[sLower]) : false;
  const pillCls = sourceOverlayClass(sLower);

  return (
    <div
      onMouseEnter={prefetch}
      onFocusCapture={prefetch}
      className={`group relative flex rounded-2xl border border-white/10 bg-[#111111] transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#161616] hover:shadow-[0_18px_36px_-24px_rgba(0,0,0,0.95)] ${isCompactHC ? "gap-3 p-2.5 sm:gap-4 sm:p-3" : "gap-4 p-3 sm:gap-5 sm:p-4"}`}
    >
      {/* Cover — visual anchor */}
        <a
        href={safeUrl(series.seriesUrl || sCh[0]?.seriesUrl) || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className={`relative block shrink-0 overflow-hidden rounded-xl bg-black focus-visible:ring-2 focus-visible:ring-white ${isCompactHC ? "h-36 w-24 sm:h-40 sm:w-28" : "h-40 w-28 sm:h-44 sm:w-32"}`}
      >
        {coverSrc && !imgErrorFinal ? (
          <>
            <img
              src={coverSrc}
              alt={decodeHtml(series.title)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              loading="lazy"
              onError={() => {
                if (!hasRetried && series.titleKey) {
                  setCoverSrc(
                    `/api/v1/cover?series=${encodeURIComponent(series.titleKey)}`
                  );
                  setHasRetried(true);
                } else {
                  setImgErrorFinal(true);
                }
              }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
            {firstSource && (
              <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-bold capitalize shadow-sm ${pillCls} ${down ? "ring-1 ring-red-300" : ""}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${down ? "bg-red-200 animate-pulse" : "bg-white/60"}`} />
                {firstSource}
              </span>
            )}
          </>
        ) : (
          <div
            className="flex h-full w-full items-center justify-center rounded-xl bg-white/5"
            title={
              hasRetried ? "Cover expired — fallback also failed" : undefined
            }
          >
            <BookOpen size={20} className="text-white/30" />
          </div>
        )}
      </a>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col py-0.5 sm:py-1">
        <div className="flex items-start gap-2">
          <OriginFlag
            origin={series.origin}
            type={flagType}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <a
            href={safeUrl(series.seriesUrl || sCh[0]?.seriesUrl) || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="block min-h-0 min-w-0 rounded focus-visible:ring-2 focus-visible:ring-white"
          >
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight text-white transition-colors group-hover:text-white/80 sm:text-base">
              {decodeHtml(series.title)}
            </h3>
          </a>
        </div>




        <RatingRow rating={(series as any).rating} genres={(series as any).genres} />

        {/* Description — di bawah judul */}
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-white/55 sm:max-w-2xl">
          {series.description ? decodeHtml(series.description) : "-"}
        </p>

        {/* Chapter pills — kotak rounded dikit */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
          {sCh.slice(0, 4).map((ch) => {
            const label = getChapterLabel(
              ch as unknown as {
                chapterLabel?: string | null;
                chapterNumber?: number | string | null;
                chapter?: string | null;
                url?: string | null;
                chapterUrl?: string | null;
              }
            );
            if (label === "?") return null;
            const href = safeUrl(ch.chapterUrl || ch.url || series.seriesUrl) || "#";
            const src = ch.source?.toLowerCase();
            const chDown = src ? !isHealthy(health[src]) : false;
            const chipColor = sourceChapterChipClass(src);
            return (
              <a
                key={ch.key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={chDown ? `${src} • down` : undefined}
                onClick={() =>
                  trackChapter({
                    title: series.title,
                    titleKey: series.titleKey,
                    cover: series.cover,
                    source: ch.source,
                    chapter:
                      (ch as unknown as { chapter?: string }).chapter ??
                      ch.chapterLabel,
                    chapterLabel: ch.chapterLabel,
                    chapterNumber: ch.chapterNumber,
                    chapterUrl: href !== "#" ? href : ch.chapterUrl || ch.url,
                    seriesUrl: series.seriesUrl,
                    origin: series.origin,
                  })
                }
                className={`inline-flex min-h-0 min-w-0 items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] leading-none transition-colors ${chipColor} ${chDown ? "opacity-60 ring-1 ring-red-400/40" : ""}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${chDown ? "bg-red-400 animate-pulse" : "bg-emerald-400/60"}`} />
                Ch. {label}
              </a>
            );
          })}
          {sCh.every(
            (c) =>
              getChapterLabel(
                c as unknown as {
                  chapterLabel?: string | null;
                  chapterNumber?: number | string | null;
                  chapter?: string | null;
                  url?: string | null;
                  chapterUrl?: string | null;
                }
              ) === "?"
          ) && sCh.length > 0 && (
              <a
                href={safeUrl(series.seriesUrl || sCh[0]?.seriesUrl) || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-0 min-w-0 items-center justify-center rounded-md bg-white/10 px-2 py-1 text-[11px] leading-none text-white/80 transition-colors hover:bg-white/20"
              >
                View Series
              </a>
            )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-3">
          {isWhitelisted ? (
            <span className="inline-flex items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-300">
              ✓ Verified
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAdd?.();
              }}
              disabled={adding}
              className="min-h-0 min-w-0 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-black shadow-[0_2px_10px_rgba(255,255,255,0.08)] transition-colors hover:bg-white/90 disabled:opacity-50"
            >
              {adding ? "..." : "+ Add WL"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupedSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 p-4 rounded-2xl border border-white/10 bg-white/5"
        >
          <div className="skeleton w-16 sm:w-20 h-24 sm:h-28 rounded-lg shrink-0" />
          <div className="flex-1 space-y-3 py-1">
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/3 rounded" />
            <div className="flex gap-2">
              <div className="skeleton h-6 w-20 rounded-md" />
              <div className="skeleton h-6 w-20 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const [isPending, startTransition] = useTransition();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.homeFeed,
    queryFn: ({ signal }) => fetchFeed({ signal }),
    staleTime: staleTimes.homeFeed,
    gcTime: gcTimes.homeFeed,
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const { optimisticWhitelist, optimisticExcluded, addingKey, handleAddGroup } = useFeedActions();
  const density = useUiStore((s) => s.density);
  const toggleDensity = useUiStore((s) => s.toggleDensity);
  const isCompact = density === "compact";

  const [isLoggedInForSnapshot, setIsLoggedInForSnapshot] = useState(false);
  useEffect(() => {
    setIsLoggedInForSnapshot(browserHasCookie(CSRF_COOKIE, LEGACY_CSRF_COOKIE));
  }, []);
  const { data: snapshot, isLoading: snapshotLoading } = useQuery({
    queryKey: queryKeys.dashboardSnapshot,
    queryFn: () =>
      Reader.getDashboardSnapshot() as Promise<
        import("@/lib/types").DashboardSnapshot
      >,
    staleTime: staleTimes.dashboard,
    gcTime: gcTimes.dashboard,
    retry: false,
    refetchOnWindowFocus: true,
    enabled: isLoggedInForSnapshot,
  });

  const { entries: continueReading, clearAll: clearContinueReading, removeReading } =
    useContinueReading();

  const sortedContinueReading = useMemo(
    () =>
      [...continueReading.values()]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        .slice(0, 10),
    [continueReading]
  );

  const rawResults = (data?.data?.results ?? []) as unknown[];
  const deferredResults = useDeferredValue(rawResults);

  // Get latest timestamp from results — auto relative + live tick
  const latestTimestamp = useMemo(() => {
    if (deferredResults.length === 0) return null;
    const times = deferredResults
      .map((r: any) => r?.updated_time || r?.sent_at || r?.updatedAt || r?.createdAt || r?.created_at || r?.updatedTime)
      .filter(Boolean)
      .map((t: string) => new Date(t).getTime())
      .filter((n) => Number.isFinite(n));
    return times.length > 0 ? Math.max(...times) : null;
  }, [deferredResults]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const { lastUpdateLabel, lastUpdateLong } = useMemo(() => {
    if (!latestTimestamp) {
      // ada data tapi timestamp ga kebaca → jangan strip, anggap Just now
      if (deferredResults.length > 0) return { lastUpdateLabel: "Just now", lastUpdateLong: new Date().toLocaleString() };
      return { lastUpdateLabel: "—", lastUpdateLong: null as string | null };
    }
    const diff = now - latestTimestamp;
    let label: string;
    if (diff < 45_000) label = "Just now";
    else if (diff < 60_000) label = `${Math.floor(diff / 1000)}s ago`;
    else if (diff < 3600_000) label = `${Math.floor(diff / 60000)}m ago`;
    else if (diff < 86400_000) label = `${Math.floor(diff / 3600000)}h ago`;
    else label = new Date(latestTimestamp).toLocaleDateString();
    return { lastUpdateLabel: label, lastUpdateLong: new Date(latestTimestamp).toLocaleString() };
  }, [latestTimestamp, now]);

  // grouped by titleKey — same seam as /recent AllTab (deferred + transition biar gak block main thread pas 1k row)
  const grouped = useMemo(() => {
    let g: GroupedSeries[];
    if (deferredResults.length === 0) return [];
    const isGrouped =
      typeof (deferredResults[0] as Record<string, unknown>)?.chapters !==
      "undefined" &&
      Array.isArray((deferredResults[0] as { chapters?: unknown[] })?.chapters);
    if (isGrouped) g = deferredResults as unknown as GroupedSeries[];
    else g = groupChapters(deferredResults as unknown as FlatChapter[]);
    if (optimisticExcluded.size > 0) {
      const isEx = (s: GroupedSeries) => {
        const nk = s.titleKey.toLowerCase();
        for (const c of s.chapters as unknown as { titleKey: string; source: string }[]) {
          const k = `${c.titleKey || s.titleKey}:${(c.source || "all").toLowerCase()}`;
          const nk2 = (c.titleKey || s.titleKey).toLowerCase();
          if (optimisticExcluded.has(k) || optimisticExcluded.has(nk2) || optimisticExcluded.has(`${k.split(":")[0]}:all`) || optimisticExcluded.has(s.titleKey) || optimisticExcluded.has(nk)) return true;
        }
        return optimisticExcluded.has(s.titleKey) || optimisticExcluded.has(nk);
      };
      g = g.filter((s) => !isEx(s));
    }
    return g;
  }, [deferredResults, optimisticExcluded]);

  const totalSent = snapshot?.overview?.totalChaptersSent ?? 0;
  const totalTracked = snapshot?.overview?.totalMangaTracked ?? 0;

  // Timeline grouping Today/Yesterday
  const groupedByDay = useMemo(() => {
    const map = new Map<string, GroupedSeries[]>();
    for (const g of grouped) {
      const raw = (g as any).latestUpdated || (g as any).updated_time || (g.chapters?.[0] as any)?.sentAt || "";
      const d = raw ? new Date(raw) : new Date();
      const key = isNaN(d.getTime()) ? "Today" : (() => {
        const now = new Date();
        const diff = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
        if (diff === 0) return "Today";
        if (diff === 1) return "Yesterday";
        if (diff < 7) return `${diff}d ago`;
        return d.toLocaleDateString();
      })();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    // order Today first
    const order = ["Today", "Yesterday"];
    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return 0;
    });
    return sortedKeys.map((k) => ({ label: k, items: map.get(k)! }));
  }, [grouped]);

  return (
    <PageShell>
      <div className="mb-8">
        <h1
          className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[-0.04em] text-white mb-2"
          style={{ fontFamily: '"Space Grotesk", var(--font-sans)' }}
        >
          ManhwaScan
        </h1>
        <p className="text-white/55 text-sm sm:text-[15px] leading-relaxed max-w-2xl">
          Read manhwa, manga, and webtoon for free. Daily updates from multiple
          sources.
        </p>
      </div>

      <RecommendedSection />

      {continueReading.size > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-white">
              Continue Reading
            </h2>
            <span className="text-xs text-white/50">
              ({continueReading.size})
            </span>
            <button
              onClick={clearContinueReading}
              className="ml-auto text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory justify-start">
            {sortedContinueReading.map((entry, i) => (
              <motion.div
                key={entry.titleKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
              >
                <ContinueReadingCard entry={entry} onRemove={() => removeReading(entry.titleKey)} />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
        {[
          {
            icon: Clock,
            label: "Today's Updates",
            value: grouped.length || rawResults.length,
          },
          {
            icon: TrendUp,
            label: "Total Series",
            value: totalTracked ?? (data?.data?.total ?? 0),
          },
          { icon: Star, label: "Total Sent", value: totalSent },
          {
            icon: ArrowClockwise,
            label: "Last Update",
            value: lastUpdateLabel,
          },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="bg-white/5 border border-white/8 rounded-xl p-3 sm:p-4 flex items-center gap-3 hover:border-white/15 transition-colors"
          >
            {isLoading || snapshotLoading ? (
              <>
                <div className="skeleton w-9 h-9 sm:w-10 sm:h-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-14 rounded" />
                  <div className="skeleton h-2.5 w-10 rounded" />
                </div>
              </>
            ) : (
              <>
                <div className="p-2 rounded-lg bg-white/10 border border-white/8">
                  <Icon
                    size={18}
                    className="text-white"
                    weight="fill"
                  />
                </div>
                <div>
                  <p
                    suppressHydrationWarning
                    className="text-base sm:text-lg font-bold tracking-[-0.02em] text-white tabular-nums"
                    title={label === "Last Update" ? (lastUpdateLong || undefined) : undefined}
                  >
                    {value}
                  </p>
                  <p className="text-[10px] sm:text-xs text-white/45 tracking-wide">
                    {label}
                  </p>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h2
          className="text-lg sm:text-[20px] font-bold tracking-[-0.03em] text-white"
          style={{ fontFamily: '"Space Grotesk", var(--font-sans)' }}
        >
          Latest Updates
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => useUiStore.getState().toggleDensity()}
            title={isCompact ? "Comfortable view" : "Compact view"}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/15 transition-colors"
          >
            {isCompact ? <ArrowsOutSimple size={12} /> : <ArrowsInSimple size={12} />} {isCompact ? "Comfy" : "Compact"}
          </button>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/15 transition-colors"
          >
            <ArrowClockwise size={12} /> Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <GroupedSkeleton />
      ) : error ? (
        <ErrorFallback
          title="Failed to load updates"
          message={
            error instanceof Error ? error.message : "Try refreshing the page"
          }
          onRetry={() => refetch()}
        />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlass />}
          message="No updates today"
          subMessage={
            lastUpdateLong
              ? `Last update: ${lastUpdateLong}`
              : "Check again later or view all in Recent"
          }
          action={
            <Link
              href="/recent"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <Compass size={14} />
              Lihat Recent
            </Link>
          }
        />
      ) : grouped.length > 14 ? (
        <VirtualizedList
          items={grouped}
          gap={isCompact ? 8 : 12}
          estimateSize={isCompact ? 160 : 184}
          renderItem={(series) => {
            const s = series as GroupedSeries;
            const sCh2 = Array.isArray((s as any)?.chapters) ? (s as any).chapters : [];
            const isWL =
              s.isWhitelisted ||
              sCh2.some((c: { titleKey: string; source: string }) =>
                optimisticWhitelist.has(
                  `${c.titleKey || s.titleKey}:${c.source}`
                )
              ) ||
              optimisticWhitelist.has(s.titleKey);
            const adding = addingKey === s.titleKey;
            const isBM = false;
            return (
              <HomeGroupedCard
                series={s}
                isWhitelisted={isWL}
                adding={adding}
                onAdd={() => handleAddGroup(s)}
              />
            );
          }}
        />
      ) : (
        <div className={`flex flex-col ${isCompact ? "gap-4" : "gap-6"}`}>
          {groupedByDay.map((group) => (
            <div key={group.label} className="space-y-2">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wide flex items-center gap-2 sticky top-14 bg-background/80 backdrop-blur py-1 z-10">
                {group.label} <span className="text-white/20">· {group.items.length}</span>
              </h3>
              <div className={`flex flex-col ${isCompact ? "gap-2" : "gap-3"}`}>
                {group.items.map((series, i) => {
                  const sChMap = Array.isArray((series as any)?.chapters) ? (series as any).chapters : [];
                  const isWL =
                    series.isWhitelisted ||
                    sChMap.some((c: { titleKey: string; source: string }) =>
                      optimisticWhitelist.has(`${c.titleKey || series.titleKey}:${c.source}`)
                    ) ||
                    optimisticWhitelist.has(series.titleKey);
                  const adding = addingKey === series.titleKey;
                  return (
                    <motion.div
                      key={series.titleKey}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 12) * 0.04, duration: 0.3 }}
                    >
                      <HomeGroupedCard series={series} isWhitelisted={isWL} adding={adding} onAdd={() => handleAddGroup(series)} />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}