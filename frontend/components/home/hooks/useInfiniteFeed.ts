"use client";
import { useEffect, useCallback, useRef, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Reader } from "@/lib/reader";
import { staleTimes, gcTimes } from "@/lib/queryKeys";
import { useToast } from "@/lib/useToast";
import type { FlatChapter } from "@/lib/feed";
import { compareFlatByNewest, chapterKey } from "@/lib/feed";

// pakai useQuery single-page + manual append untuk page 2+ (stabil, tidak sentuh data.pages.length internal)
const PAGE_SIZE = 100;

export function useInfiniteFeed(opts: {
  sourceFilter: string | null | undefined;
  typeFilter: string | null | undefined;
  feed: "all" | "nowl" | "wl" | string | null | undefined;
}) {
  const { sourceFilter: sfRaw, typeFilter: tfRaw, feed: feedRaw } = opts;
  const sourceFilter = typeof sfRaw === "string" ? sfRaw : null;
  const typeFilter = typeof tfRaw === "string" ? tfRaw : null;
  const feed = (feedRaw === "wl" || feedRaw === "nowl" || feedRaw === "all") ? feedRaw : "all";
  const { toast } = useToast();
  const whitelistParam = feed === "wl";
  const exclude = undefined;
  const typeParam = typeFilter && typeFilter !== "no_type" ? typeFilter : null;

  const queryKey = useMemo(() => [
      "rss-feed-flat-infinite",
      exclude ?? "",
      PAGE_SIZE,
      sourceFilter || "all",
      whitelistParam,
      typeParam ?? "all",
    ] as const, [exclude, sourceFilter, whitelistParam, typeParam]);

  // page 1 via useQuery (cache, staleTime, keepPreviousData biar tidak flash)
  const {
    data: firstPage,
    isLoading,
    isFetching: isFetchingFirst,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      return Reader.getRssFlatPage(1, PAGE_SIZE, {
        exclude,
        whitelist: whitelistParam,
        source: sourceFilter || null,
        type: typeParam,
      });
    },
    staleTime: staleTimes.rss,
    gcTime: gcTimes.rss,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    placeholderData: keepPreviousData,
  });

  // manual pages 2+ (append-only, tidak pakai TanStack infinite)
  const [extraPages, setExtraPages] = useState<Array<{ results: FlatChapter[]; hasMore: boolean; page: number }>>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreExtra, setHasMoreExtra] = useState<boolean | null>(null);

  // reset saat filter ganti
  useEffect(() => {
    setExtraPages([]);
    setHasMoreExtra(null);
  }, [sourceFilter, typeParam, whitelistParam, exclude]);

  // reset scroll on filter change
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [sourceFilter, typeParam, whitelistParam]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [feed]);

  const hasMore = useMemo(() => {
    if (hasMoreExtra !== null) return hasMoreExtra;
    const fp: any = firstPage as any;
    if (!fp) return false;
    if (typeof fp.hasMore === "boolean") return fp.hasMore;
    // fallback: kalau totalPages ada
    if (typeof fp.totalPages === "number" && typeof fp.page === "number") return fp.page < fp.totalPages;
    return false;
  }, [firstPage, hasMoreExtra]);

  const allItems = useMemo(() => {
    const seen = new Set<string>();
    const flat: FlatChapter[] = [];
    const push = (arr: unknown) => {
      const list = Array.isArray(arr) ? (arr as FlatChapter[]) : [];
      for (const c of list) {
        if (!c || typeof (c as any).titleKey !== "string") continue;
        try {
          const k = chapterKey(c as FlatChapter);
          if (!k) continue;
          if (!seen.has(k)) { seen.add(k); flat.push(c as FlatChapter); }
        } catch {}
      }
    };
    const fp: any = firstPage as any;
    push(fp?.results);
    for (const pg of extraPages) push(pg.results);
    try { return flat.sort(compareFlatByNewest); } catch { return flat; }
  }, [firstPage, extraPages]);

  const nextPageRef = useRef(2);
  useEffect(() => { nextPageRef.current = 2; }, [sourceFilter, typeParam, whitelistParam, exclude]);

  const loadMore = useCallback(async () => {
    if (loadingMore || isLoading) return;
    if (!hasMore) return;
    setLoadingMore(true);
    const p = nextPageRef.current;
    try {
      const res: any = await Reader.getRssFlatPage(p, PAGE_SIZE, {
        exclude,
        whitelist: whitelistParam,
        source: sourceFilter || null,
        type: typeParam,
      });
      const results: FlatChapter[] = Array.isArray(res?.results) ? res.results : [];
      const hm = typeof res?.hasMore === "boolean" ? res.hasMore : results.length === PAGE_SIZE;
      setExtraPages((prev) => [...prev, { results, hasMore: hm, page: p }]);
      setHasMoreExtra(hm);
      nextPageRef.current = p + 1;
      if (!hm) toast("Sudah paling akhir", "info");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      toast("Failed to load more — check connection", "error");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, isLoading, hasMore, exclude, whitelistParam, sourceFilter, typeParam, toast]);

  const isFetching = isFetchingFirst || loadingMore;
  const page = 1 + extraPages.length;
  const hasNextPage = hasMore;
  const isFetchingNextPage = loadingMore;
  const fetchNextPage = loadMore as unknown as () => Promise<void>;

  // infinite scroll observer
  const loadingRef = useRef({ loadingMore, loadMore });
  loadingRef.current = { loadingMore, loadMore };
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
      if (!node || !hasMore) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const { loadingMore: busy, loadMore: doLoad } = loadingRef.current;
          if (entries[0]?.isIntersecting && !busy) doLoad();
        },
        { rootMargin: "600px 0px", threshold: 0 }
      );
      observerRef.current.observe(node);
    },
    [hasMore]
  );

  useEffect(() => {
    return () => { if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; } };
  }, []);

  return {
    allItems,
    sentinelRef,
    hasMore,
    loadingMore,
    loadMore,
    isLoading,
    isFetching,
    error,
    refetch,
    page,
    PAGE_SIZE,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } as const;
}
