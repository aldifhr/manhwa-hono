import { useQuery } from "@tanstack/react-query";
import { Reader } from "@/lib/reader";
import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { queryKeys, staleTimes, gcTimes } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { SkeletonGrid } from "@/components/SkeletonGrid";
import { ErrorFallback } from "@/components/ErrorFallback";
import EmptyState from "@/components/EmptyState";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useReadItems } from "./useReadItems";
import { useFeedGrouping } from "./hooks/useFeedGrouping";
import { useFeedMeta } from "./hooks/useFeedMeta";
import dynamic from "next/dynamic";
const AllCard = dynamic(() => import("./AllCard"), {
  ssr: false,
  loading: () => (
    <div className="skeleton h-28 rounded-xl border border-white/10" />
  ),
});
const GroupedSeriesCard = dynamic(() => import("./GroupedSeriesCard"), {
  ssr: false,
  loading: () => (
    <div className="skeleton h-28 rounded-xl border border-white/10" />
  ),
});
import VirtualizedList from "./VirtualizedList";
import AllTabFilters from "./AllTabFilters";
import {
  groupChapters,
  seriesHasNewWithin,
  type GroupedSeries,
} from "@/lib/groupChapters";
import { useUiStore } from "@/lib/uiStore";
import { useUiUrlSync } from "@/lib/useUiUrlSync";
import { useDebounced } from "@/lib/useDebounced";
import { usePacerThrottledScroll } from "@/lib/usePacerThrottles";
import { PageShell } from "@/components/PageShell";
import { useSourcesHealth } from "@/hooks/useSourcesHealth";
import { normalizeTitleKey } from "@/lib/groupChapters";
import { normalizeType } from "@/lib/feed";
import { usePinnedSet } from "./hooks/usePinnedSet";
import { useInfiniteFeed } from "./hooks/useInfiniteFeed";
import { useFeedActions } from "./hooks/useFeedActions";
import AllTabHeader from "./AllTabHeader";
import AllTabToolbar from "./AllTabToolbar";
import InfiniteSentinel from "./InfiniteSentinel";
import FilterDrawer from "./FilterDrawer";
import type { FlatChapter } from "@/lib/feed";
import { resolveSeriesUrl, compareFlatByNewest } from "@/lib/feed";

// re-export for external consumers (app/page.tsx)
export type { FlatChapter } from "@/lib/feed";

function AllTabInner() {
  const { readItems, toggleRead, toggleReadAll, markAllRead } = useReadItems();
  const searchParams = useSearchParams();
  const deepLinkSeries = searchParams.get("series");
  useUiUrlSync();

  // Zustand selectors: subscribe only to needed slices
  const feed = useUiStore((s) => s.feed);
  const groupMode = useUiStore((s) => s.groupMode);
  const sortMode = useUiStore((s) => s.sortMode);
  const view = useUiStore((s) => s.contentView);
  const sourceFilter = useUiStore((s) => s.sourceFilter);
  const typeFilter = useUiStore((s) => s.typeFilter);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const genreFilter = useUiStore((s) => s.genreFilter);
  const minRating = useUiStore((s) => s.minRating);
  const whitelistOnly = useUiStore((s) => s.whitelistOnly);
  const density = useUiStore((s) => s.density);
  const isCompact = density === "compact";
  const setFeed = useUiStore((s) => s.setFeed);
  const toggleGroupMode = useUiStore((s) => s.toggleGroupMode);
  const setSortMode = useUiStore((s) => s.setSortMode);
  const setSourceFilter = useUiStore((s) => s.setSourceFilter);
  const setTypeFilter = useUiStore((s) => s.setTypeFilter);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const resetFilters = useUiStore((s) => s.resetFilters);

  // Debounced search input
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debouncedLocalSearch = useDebounced(localSearch, 300);
  useEffect(() => {
    if (debouncedLocalSearch !== searchQuery)
      setSearchQuery(debouncedLocalSearch);
  }, [debouncedLocalSearch, searchQuery, setSearchQuery]);
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const [filterOpen, setFilterOpen] = useState(false);
  // Reusable hooks
  const { pinnedSet, togglePin } = usePinnedSet();
  const {
    allItems,
    sentinelRef,
    hasMore,
    loadingMore,
    loadMore,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useInfiniteFeed({
    sourceFilter,
    typeFilter,
    feed,
  });
  const {
    optimisticWhitelist,
    optimisticExcluded,
    excludingKey,
    addingKey,
    handleAdd,
    handleAddGroup,
    handleAddGroupSource,
    handleExclude,
    handleExcludeSeries,
  } = useFeedActions();

  const all = (allItems ?? []) as typeof allItems;

  // "Sent to Discord" label
  const isSentAvailable =
    all.length > 0 && all.some((c) => c.isSent !== undefined);
  const { data: dispatchHistory } = useQuery({
    queryKey: queryKeys.dispatchHistory(),
    queryFn: () =>
      Reader.getDispatchHistory(1, 2000) as unknown as Promise<
        import("@/lib/types").DispatchHistoryItem[]
      >,
    staleTime: staleTimes.dispatch,
    gcTime: gcTimes.dispatch,
    refetchInterval: 300_000,
    refetchOnWindowFocus: true,
    enabled: all.length > 0 && !isSentAvailable,
  });
  const sentKeys = useMemo(() => {
    const s = new Set<string>();
    for (const h of dispatchHistory ?? []) {
      if (h.titleKey && h.source && h.chapter)
        s.add(`${h.titleKey}:${h.source}:${h.chapter}`);
    }
    return s;
  }, [dispatchHistory]);

  const isExcludedFlat = useCallback(
    (c: FlatChapter) => {
      const src = (c.source || "").toLowerCase();
      if (!src) return false;
      const nk = normalizeTitleKey(c.titleKey);
      return (
        optimisticExcluded.has(`${c.titleKey}:${src}`) ||
        optimisticExcluded.has(`${nk}:${src}`)
      );
    },
    [optimisticExcluded]
  );

  const isExcludedSeries = useCallback(
    (s: GroupedSeries) => {
      const chs = Array.isArray(s?.chapters) ? s.chapters : [];
      const keys = [
        ...new Set(
          chs.map(
            (ch) =>
              `${ch.titleKey || s.titleKey}:${(ch.source || "").toLowerCase()}`
          )
        ),
      ].filter((k) => !k.endsWith(":"));
      if (keys.length === 0) return false;
      const nkeys = keys.map((k) => {
        const [tk, src] = k.split(":");
        return `${normalizeTitleKey(tk)}:${src}`;
      });
      return [...keys, ...nkeys].every((k) => optimisticExcluded.has(k));
    },
    [optimisticExcluded]
  );

  const filtered = useMemo(() => {
    let f = all;
    if (optimisticExcluded.size > 0)
      f = f.filter((c) => !isExcludedFlat(c));
    if (sourceFilter) f = f.filter((c) => (c.source || "") === sourceFilter);
    // typeFilter already handled by BE WHERE before LIMIT (0079734 dual format/type) — no client re-filter

    if (feed === "nowl")
      f = f.filter(
        (c) =>
          !(
            c.isWhitelisted ||
            optimisticWhitelist.has(`${c.titleKey}:${c.source}`) ||
            optimisticWhitelist.has(
              `${normalizeTitleKey(c.titleKey)}:${c.source}`
            )
          )
      );
    if (feed === "wl")
      f = f.filter(
        (c) =>
          c.isWhitelisted ||
          optimisticWhitelist.has(`${c.titleKey}:${c.source}`) ||
          optimisticWhitelist.has(
            `${normalizeTitleKey(c.titleKey)}:${c.source}`
          )
      );
    if (genreFilter)
      f = f.filter((c) =>
        (c.genres || [])
          .map((g: string) => g.toLowerCase())
          .includes(genreFilter.toLowerCase())
      );
    if (minRating) {
      const mr = parseFloat(minRating);
      if (!isNaN(mr))
        f = f.filter((c) => parseFloat(String(c.rating || "0")) >= mr);
    }
    if (whitelistOnly)
      f = f.filter(
        (c) =>
          c.isWhitelisted ||
          optimisticWhitelist.has(`${c.titleKey}:${c.source}`)
      );
    const q = searchQuery.trim().toLowerCase();
    if (q) f = f.filter((c) => (c.title || "").toLowerCase().includes(q));
    // Avoid allocating a cloned array of N objects on every filter change.
    // resolveSeriesUrl is `seriesUrl || chapterUrl`, so only items missing
    // seriesUrl need a new object — the rest pass through by reference,
    // which also keeps React.memo hits high in the card components.
    return f.map((c) => (c.seriesUrl ? c : { ...c, seriesUrl: resolveSeriesUrl(c) }));
  }, [
    all,
    optimisticExcluded,
    isExcludedFlat,
    sourceFilter,
    typeFilter,
    genreFilter,
    minRating,
    whitelistOnly,
    optimisticWhitelist,
    searchQuery,
    feed,
  ]);

  const deepLinkRef = useRef<HTMLDivElement | null>(null);
  const scrollKey = "alltab_scroll";
  const [initialScrollOffset, setInitialScrollOffset] = useState<number | undefined>(undefined);
  useEffect(() => {
    setInitialScrollOffset(Number(localStorage.getItem(scrollKey) || "0"));
  }, []);

  const { grouped, flatDisplay, newSeriesKeys } = useFeedGrouping(filtered, {
    pinnedSet,
    sortMode,
    view,
  });

  // sort/group debug removed

  // nowl + type filter: client filter after fetch 100 can be empty while hasMore true → auto fetch next page until filled
  useEffect(() => {
    if (filtered.length === 0 && hasMore && !isLoading && !loadingMore && !error) {
      loadMore();
    }
  }, [filtered.length, hasMore, isLoading, loadingMore, error, loadMore]);

  const deepLinkLower = deepLinkSeries?.toLowerCase() ?? "";
  const groupedDeepLinkIndex = useMemo(() => {
    if (!deepLinkLower) return -1;
    return grouped.findIndex((s) => s.titleKey.toLowerCase() === deepLinkLower);
  }, [grouped, deepLinkLower]);
  const flatDeepLinkIndex = useMemo(() => {
    if (!deepLinkLower) return -1;
    return flatDisplay.findIndex(
      (c) => c.titleKey.toLowerCase() === deepLinkLower
    );
  }, [flatDisplay, deepLinkLower]);

  useEffect(() => {
    if (!groupMode || !deepLinkSeries || filtered.length === 0) return;
    const t = setTimeout(() => {
      const cards = document.querySelectorAll<HTMLElement>("[data-title-key]");
      const el =
        [...cards].find(
          (c) => (c.dataset.titleKey || "").toLowerCase() === deepLinkLower
        ) ?? deepLinkRef.current;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add(
        "ring-2",
        "ring-accent",
        "ring-offset-2",
        "ring-offset-background",
        "transition-all"
      );
      setTimeout(
        () =>
          el?.classList.remove(
            "ring-2",
            "ring-accent",
            "ring-offset-2",
            "ring-offset-background"
          ),
        2500
      );
    }, 300);
    return () => clearTimeout(t);
  }, [deepLinkSeries, deepLinkLower, filtered, groupMode]);

  useEffect(() => {
    const saved = Number(localStorage.getItem(scrollKey) || "0");
    if (saved > 0) {
      const t = setTimeout(() => window.scrollTo({ top: saved }), 200);
      return () => clearTimeout(t);
    }
  }, []);

  const throttledSaveScroll = usePacerThrottledScroll(() => {
    localStorage.setItem(scrollKey, String(window.scrollY));
  }, 250);
  useEffect(() => {
    window.addEventListener("scroll", throttledSaveScroll, { passive: true });
    return () => window.removeEventListener("scroll", throttledSaveScroll);
  }, [throttledSaveScroll]);

  // Derive counts from `filtered` (same data as displayed) — consistent with grouped.length
  const filteredDistinctTotal = useMemo(
    () => new Set(filtered.map((c) => c.titleKey)).size,
    [filtered]
  );
  const filteredWlCount = useMemo(
    () =>
      new Set(
        filtered
          .filter(
            (c) =>
              c.isWhitelisted ||
              optimisticWhitelist.has(`${c.titleKey}:${c.source}`)
          )
          .map((c) => c.titleKey)
      ).size,
    [filtered, optimisticWhitelist]
  );

  const {
    sources,
    typeCounts,
    wlCount: _wlCount,
    nowlCount: _nowlCount,
    distinctTotal: _distinctTotal,
  } = useFeedMeta(all, optimisticWhitelist);
  const distinctTotal = filteredDistinctTotal || _distinctTotal;
  const wlCount = filteredWlCount || _wlCount;
  const nowlCount = Math.max(0, distinctTotal - wlCount);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape" && typing) {
        (e.target as HTMLElement).blur();
        return;
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("home-search-input")?.focus();
      } else if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        window.scrollBy({
          top: e.key === "j" ? 320 : -320,
          behavior: "smooth",
        });
      } else if (e.key === "Escape") {
        resetFilters();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resetFilters]);

  if (isLoading)
    return (
      <PageShell>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2 sm:gap-3 flex-wrap">
            <div className="skeleton h-6 sm:h-7 w-28 sm:w-32 rounded" />
            <div className="skeleton h-7 w-36 sm:w-44 rounded-lg" />
            <div className="skeleton h-4 w-16 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="skeleton h-10 flex-1 min-w-37.5 rounded-lg" />
          <div className="skeleton h-10 w-24 rounded-lg" />
          <div className="skeleton h-10 w-20 rounded-lg" />
        </div>
        <div className="sticky top-2 z-10 bg-black/80 backdrop-blur-md -mx-1 px-1 py-2 flex flex-col gap-2">
          <div className="flex gap-2 pb-1 -mx-1 px-1">
            <div className="skeleton h-7 w-28 rounded-full shrink-0" />
            <div className="skeleton h-7 w-24 rounded-full shrink-0" />
            <div className="skeleton h-7 w-24 rounded-full shrink-0" />
            <div className="skeleton h-7 w-24 rounded-full shrink-0" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="skeleton h-7 w-12 rounded-full" />
            <div className="skeleton h-7 w-14 rounded-full" />
            <div className="skeleton h-7 w-20 rounded-full" />
          </div>
        </div>
        <SkeletonGrid
          variant={groupMode ? "group-item" : "list-item"}
          hideHeader
        />
      </PageShell>
    );
  if (error)
    return (
      <PageShell>
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-white">
          All Manga
        </h1>
        <ErrorFallback
          title="Failed to load manga list"
          onRetry={() => refetch()}
        />
      </PageShell>
    );

  return (
    <PageShell>
      {/* Refetch indicator */}
      {isFetching && !isLoading && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-accent/50 animate-pulse" />
      )}
      <AllTabHeader
        feed={feed}
        setFeed={setFeed}
        distinctTotal={distinctTotal}
        wlCount={wlCount}
        nowlCount={nowlCount}
        groupedCount={groupMode ? grouped.length : flatDisplay.length}
        countLabel={groupMode ? "series" : "chapters"}
        hasData={all.length > 0}
      />
      <AllTabToolbar
        localSearch={localSearch}
        setLocalSearch={setLocalSearch}
        sortMode={sortMode}
        setSortMode={setSortMode}
        groupMode={groupMode}
        toggleGroupMode={toggleGroupMode}
      />
      <FilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} />
      <AllTabFilters
        sources={sources}
        typeCounts={typeCounts}
        sourceFilter={sourceFilter}
        typeFilter={typeFilter}
        setSourceFilter={setSourceFilter}
        setTypeFilter={setTypeFilter}
      />

      {grouped.length === 0 ? (
        hasMore || loadingMore ? (
          <div className="flex justify-center py-8">
            <span className="text-xs text-white/50 animate-pulse">
              Loading chapters…
            </span>
          </div>
        ) : (
          <EmptyState
            icon={<MagnifyingGlass />}
            message={view === "fav" ? "No favorites yet" : "No chapters found"}
            subMessage={
              view === "fav"
                ? "Click the Pin (📌) button on a card to add"
                : all.length > 0
                  ? "Filters hide all results — try clearing them"
                  : "Try adjusting the filters above"
            }
            action={
              all.length > 0 &&
              (sourceFilter ||
                typeFilter ||
                searchQuery ||
                feed !== "all") ? (
                <button
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition-colors"
                >
                  Reset filters
                </button>
              ) : undefined
            }
          />
        )
      ) : groupMode ? (
        <VirtualizedList
          items={grouped}
          gap={isCompact ? 8 : 12}
          estimateSize={isCompact ? 160 : 186}
          overscan={6}
          initialScrollOffset={initialScrollOffset}
          scrollToTitleKey={deepLinkSeries}
          titleKeyOf={(s) => (s as GroupedSeries).titleKey}
          renderItem={(series, i) => {
            const s = series as GroupedSeries;
            const sCh = Array.isArray(s?.chapters) ? s.chapters : [];
            const isRead =
              sCh.length > 0 &&
              sCh.every(
                (c) => readItems.has(c.url) || readItems.has(c.chapterUrl)
              );
            const isWL =
              s.isWhitelisted ||
              optimisticWhitelist.has(
                `${s.titleKey}:${sCh[0]?.source || ""}`
              );
            const isDeepMatch = i === groupedDeepLinkIndex;
            return (
              <motion.div
                key={s.titleKey}
                data-title-key={s.titleKey}
                ref={
                  isDeepMatch
                    ? (deepLinkRef as unknown as React.RefObject<HTMLDivElement>)
                    : undefined
                }
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i % 10, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  isDeepMatch &&
                    "ring-2 ring-white ring-offset-2 ring-offset-black rounded-xl"
                )}
              >
                <GroupedSeriesCard
                  series={s}
                  isRead={isRead}
                  isWhitelisted={isWL}
                  isNew={newSeriesKeys.has(s.titleKey)}
                  isPinned={pinnedSet.has(s.titleKey)}
                  unreadCount={
                    sCh.filter((c) => !readItems.has(c.url)).length
                  }
                  readCount={
                    sCh.filter((c) => readItems.has(c.url)).length
                  }
                  totalChapters={sCh.length}
                  adding={addingKey === s.titleKey}
                  onToggleRead={() =>
                    toggleReadAll(sCh.map((c) => c.url))
                  }
                  onTogglePin={() => togglePin(s.titleKey)}
                  onMarkRead={() => markAllRead(sCh.map((c) => c.url))}
                  onExclude={() => handleExcludeSeries(s)}
                  isExcluded={isExcludedSeries(s)}
                  excluding={excludingKey === s.titleKey}
                  onAdd={() => handleAddGroup(s)}
                  onAddSource={(src: string) => handleAddGroupSource(s, src)}
                  isSentToDiscord={sCh.some(
                    (c) => c.isSent === true || sentKeys.has(c.key)
                  )}
                />
              </motion.div>
            );
          }}
        />
      ) : (
        <VirtualizedList
          items={flatDisplay}
          initialScrollOffset={initialScrollOffset}
          gap={isCompact ? 8 : 12}
          estimateSize={isCompact ? 155 : 180}
          scrollToTitleKey={deepLinkSeries}
          titleKeyOf={(c) => c.titleKey}
          renderItem={(item, i) => {
            const isRead = readItems.has(item.url) || readItems.has(item.chapterUrl);
            const optKey = `${item.titleKey}:${item.source}`;
            const isWL = item.isWhitelisted || optimisticWhitelist.has(optKey);
            const isDeepMatch = i === flatDeepLinkIndex;
            return (
              <motion.div
                data-title-key={item.titleKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(i % 10, 6) * 0.035, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  isDeepMatch &&
                    "ring-2 ring-accent ring-offset-2 ring-offset-background transition-all"
                )}
              >
                <AllCard
                  item={item}
                  isRead={isRead}
                  isWhitelisted={isWL}
                  isNew={newSeriesKeys.has(item.titleKey)}
                  adding={addingKey === item.titleKey}
                  onToggleRead={() => toggleRead(item.url)}
                  onAdd={() => handleAdd(item)}
                  isExcluded={isExcludedFlat(item)}
                  excluding={excludingKey === item.titleKey}
                  isPinned={pinnedSet.has(item.titleKey)}
                  onTogglePin={() => togglePin(item.titleKey)}
                  onExclude={() => handleExclude(item)}
                  isSentToDiscord={
                    item.isSent === true ||
                    sentKeys.has(
                      `${item.titleKey}:${item.source}:${item.chapter}`
                    )
                  }
                />
              </motion.div>
            );
          }}
        />
      )}

      <InfiniteSentinel
        ref={sentinelRef}
        hasMore={hasMore}
        loadingMore={grouped.length > 0 ? loadingMore : false}
        onLoadMore={loadMore}
        filteredLength={filtered.length}
        groupedLength={grouped.length}
      />
    </PageShell>
  );
}

export default function AllTab() {
  return (
    <Suspense fallback={<SkeletonGrid />}>
      <AllTabInner />
    </Suspense>
  );
}

