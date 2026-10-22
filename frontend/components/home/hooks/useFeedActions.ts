"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { CSRF_COOKIE, LEGACY_CSRF_COOKIE, browserHasCookie } from "@/lib/cookies";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Reader } from "@/lib/reader";
import { queryKeys, staleTimes, gcTimes } from "@/lib/queryKeys";
import { useToast } from "@/lib/useToast";
import type { FlatChapter } from "@/lib/feed";
import type { GroupedSeries } from "@/lib/groupChapters";

export function useFeedActions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [optimisticWhitelist, setOptimisticWhitelist] = useState<Set<string>>(
    new Set()
  );
  const [optimisticExcluded, setOptimisticExcluded] = useState<Set<string>>(
    new Set()
  );
  const [excludingKey, setExcludingKey] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  // refs to avoid stale closure race in mutationFn
  const excludedRef = useRef(optimisticExcluded);
  useEffect(() => { excludedRef.current = optimisticExcluded; }, [optimisticExcluded]);

  // per-key lock via Set (prevents concurrent toggle race on same title)
  const pendingKeys = useRef<Set<string>>(new Set());

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    const check = () => setIsLoggedIn(typeof document !== "undefined" && browserHasCookie(CSRF_COOKIE, LEGACY_CSRF_COOKIE));
    check();
    const id = setInterval(check, 2000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);
  const { data: excludedData } = useQuery({
    queryKey: queryKeys.excludedTitles,
    queryFn: () =>
      Reader.getExcludedTitles() as Promise<
        { titleKey: string; source?: string }[]
      >,
    enabled: isLoggedIn,
    staleTime: staleTimes.excluded,
    gcTime: gcTimes.excluded,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (excludedData) {
      setOptimisticExcluded(
        new Set(
          excludedData
            .filter((e) => !!e.source)
            .map((e) => `${e.titleKey}:${e.source!.toLowerCase()}`)
        )
      );
    }
  }, [excludedData]);

  const addMutation = useMutation({
    mutationFn: async (item: FlatChapter) => {
      const optKey = `${item.titleKey}:${item.source}`;
      // Pre-check via React Query cache (A: jangan langsung API tiap call) — reuse stale 2m cache
      try {
        const fresh = (await queryClient.fetchQuery({
          queryKey: queryKeys.whitelist(false),
          queryFn: () => Reader.getWhitelist(1, 1000, false) as Promise<unknown>,
          staleTime: staleTimes.whitelist,
          gcTime: gcTimes.whitelist,
        })) as unknown as Array<{ titleKey?: string; source?: string }>;
        const exists = fresh.some((e) => `${e.titleKey}:${e.source}` === optKey);
        if (exists) {
          return { item, result: { status: "already_exists" as const }, optKey };
        }
      } catch {
        // If refetch fails, proceed with add attempt (BE upsert handles it)
      }
      return {
        item,
        result: (await Reader.addWhitelistEntry({
          title: item.title,
          seriesUrl: item.seriesUrl,
          source: item.source,
          title_key: item.titleKey,
          cover: item.cover,
          rating: item.rating,
          origin: item.origin,
          genres: item.genres,
          description: item.description ?? undefined,
        } as Record<string, unknown>)) as {
          status: "added" | "already_exists";
        },
        optKey,
      };
    },
    onMutate: (item) => setAddingKey(item.titleKey),
    onSuccess: ({ result, optKey, item }) => {
      // already_exists should also become optimistic Added (bandel fix for Full-time Hunter UUID vs slug)
      setOptimisticWhitelist((prev) => new Set(prev).add(optKey));
      queryClient.invalidateQueries({ queryKey: queryKeys.whitelistAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat"] });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat-infinite"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.rssFeedInfinite() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSnapshot });
      const isExists = result.status === "already_exists";
      toast(
        isExists ? "Already in whitelist" : `Added ${item.title} to whitelist`,
        {
          type: "success",
          duration: 5000,
          action: isExists
            ? undefined
            : {
                label: "Undo",
                onClick: () => {
                  setOptimisticWhitelist((prev) => {
                    const n = new Set(prev);
                    n.delete(optKey);
                    return n;
                  });
                  const [tk, src] = optKey.split(":");
                  if (tk && src)
                    Reader.removeWhitelistEntry({
                      title_key: tk,
                      source: src,
                    } as Record<string, unknown>).catch(() => {});
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.whitelistAll,
                  });
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.homeFeed,
                  });
                },
              },
        }
      );
    },
    onError: (err) =>
      toast(err instanceof Error ? err.message : "Failed to add", "error"),
    onSettled: () => setAddingKey(null),
  });

  const addGroupMutation = useMutation({
    mutationFn: async (series: GroupedSeries) => {
      const chapterKeys = series.chapters.map(
        (c: any) => `${c.titleKey || series.titleKey}:${c.source}`
      );
      const optKeys = [...new Set(chapterKeys)];
      // Pre-check via cache (A) — bulk whitelist fetched once & shared
      try {
        const fresh = (await queryClient.fetchQuery({
          queryKey: queryKeys.whitelist(false),
          queryFn: () => Reader.getWhitelist(1, 1000, false) as Promise<unknown>,
          staleTime: staleTimes.whitelist,
          gcTime: gcTimes.whitelist,
        })) as unknown as Array<{ titleKey?: string; source?: string }>;
        const freshKeys = new Set(fresh.map((e) => `${e.titleKey}:${e.source}`));
        const alreadyPresent = optKeys.filter((k) => freshKeys.has(k));
        const missing = optKeys.filter((k) => !freshKeys.has(k));
        // If all already exist, short-circuit
        if (missing.length === 0) {
          return { results: alreadyPresent.map(() => ({ status: "already_exists" as const })), optKeys, skipped: true };
        }
        // Build bySource only for missing keys
        const bySource = new Map<string, { titleKey: string; seriesUrl: string }>();
        for (const k of missing) {
          const src = k.split(":")[1];
          const tk = k.split(":")[0];
          if (!bySource.has(src)) {
            const chapter = series.chapters.find((c: any) => (c.titleKey || series.titleKey) === tk && c.source === src) as any;
            bySource.set(src, { titleKey: tk, seriesUrl: (chapter?.seriesUrl) || series.seriesUrl });
          }
        }
        const results = await Promise.all(
          [...bySource.entries()].map(([s, v]) =>
            Reader.addWhitelistEntry({
              title: series.title,
              seriesUrl: v.seriesUrl || undefined,
              source: s,
              title_key: v.titleKey,
              cover: series.cover,
              rating: series.rating,
              origin: series.origin,
              genres: series.genres,
              description: series.description ?? undefined,
            } as Record<string, unknown>)
          )
        );
        // Combine with already-existing
        const allResults = [
          ...alreadyPresent.map(() => ({ status: "already_exists" as const })),
          ...results,
        ];
        return { results: allResults, optKeys, skipped: false };
      } catch {
        // If refetch fails, proceed with original behavior
      }
      // Fallback: original behavior
      const bySource = new Map<string, { titleKey: string; seriesUrl: string }>();
      for (const c of series.chapters as any[]) {
        if (!bySource.has(c.source))
          bySource.set(c.source, {
            titleKey: c.titleKey || series.titleKey,
            seriesUrl: c.seriesUrl || series.seriesUrl,
          });
      }
      const results = await Promise.all(
        [...bySource.entries()].map(([s, v]) =>
          Reader.addWhitelistEntry({
            title: series.title,
            seriesUrl: v.seriesUrl || undefined,
            source: s,
            title_key: v.titleKey,
            cover: series.cover,
            rating: series.rating,
            origin: series.origin,
            genres: series.genres,
            description: series.description ?? undefined,
          } as Record<string, unknown>)
        )
      );
      return { results, optKeys, skipped: false };
    },
    onMutate: (series) => setAddingKey(series.titleKey),
    onSuccess: ({ results, optKeys }, series) => {
      setOptimisticWhitelist((prev) => new Set([...prev, ...optKeys]));
      queryClient.invalidateQueries({ queryKey: queryKeys.whitelistAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat"] });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat-infinite"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.rssFeedInfinite() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSnapshot });
      const allExist = results.every((r) => r.status === "already_exists");
      toast(allExist ? "Already in whitelist" : `Added ${series.title} to whitelist`, {
        type: "success",
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            // rollback optimistic + BE delete per source
            setOptimisticWhitelist((prev) => {
              const n = new Set(prev);
              for (const k of optKeys) n.delete(k);
              return n;
            });
            // fire delete per source (best-effort)
            const bySource = new Map<string, string>();
            for (const k of optKeys) {
              const [tk, src] = k.split(":");
              if (src && !bySource.has(src)) bySource.set(src, tk);
            }
            for (const [src, tk] of bySource) {
              Reader.removeWhitelistEntry({
                title_key: tk,
                source: src,
              } as Record<string, unknown>).catch(() => {});
            }
            queryClient.invalidateQueries({ queryKey: queryKeys.whitelistAll });
          },
        },
      });
    },
    onError: (err) =>
      toast(err instanceof Error ? err.message : "Failed to add", "error"),
    onSettled: () => setAddingKey(null),
  });

  /**
   * Subscribe ONE source of a multi-source series.
   *
   * Needed because a card groups the same title across sources: when the series
   * is already whitelisted on shinigami, the card shows "Verified" and the bulk
   * addGroupMutation would skip the source that is still missing. This adds just
   * the one the operator clicked.
   */
  const addGroupSourceMutation = useMutation({
    mutationFn: async (args: { series: GroupedSeries; source: string }) => {
      const { series, source } = args;
      const src = source.toLowerCase();
      const chapter = series.chapters.find(
        (c) => (c.source || "").toLowerCase() === src
      );
      const titleKey = chapter?.titleKey || series.titleKey;
      const optKey = `${titleKey}:${src}`;
      const result = await Reader.addWhitelistEntry({
        title: series.title,
        seriesUrl: chapter?.seriesUrl || series.seriesUrl || undefined,
        source: src,
        title_key: titleKey,
        cover: series.cover,
        rating: series.rating,
        origin: series.origin,
        genres: series.genres,
        description: series.description ?? undefined,
      } as Record<string, unknown>);
      return { result, optKey, series, source: src };
    },
    onMutate: ({ series }) => setAddingKey(series.titleKey),
    onSuccess: ({ result, optKey, series, source }) => {
      setOptimisticWhitelist((prev) => new Set(prev).add(optKey));
      queryClient.invalidateQueries({ queryKey: queryKeys.whitelistAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat"] });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat-infinite"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.rssFeedInfinite() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSnapshot });
      const isExists = (result as { status?: string })?.status === "already_exists";
      toast(
        isExists
          ? `Already in whitelist (${source})`
          : `Added ${series.title} (${source}) to whitelist`,
        {
          type: "success",
          duration: 5000,
          action: isExists
            ? undefined
            : {
                label: "Undo",
                onClick: () => {
                  setOptimisticWhitelist((prev) => {
                    const n = new Set(prev);
                    n.delete(optKey);
                    return n;
                  });
                  const [tk, src] = optKey.split(":");
                  if (tk && src)
                    Reader.removeWhitelistEntry({
                      title_key: tk,
                      source: src,
                    } as Record<string, unknown>).catch(() => {});
                  queryClient.invalidateQueries({ queryKey: queryKeys.whitelistAll });
                  queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
                },
              },
        }
      );
    },
    onError: (err) =>
      toast(err instanceof Error ? err.message : "Failed to add", "error"),
    onSettled: () => setAddingKey(null),
  });

  const excludeMutation = useMutation({
    mutationFn: async (item: FlatChapter) => {
      const src = (item.source || "").toLowerCase();
      if (!src) throw new Error("Cannot exclude: item has no source");
      const key = `${item.titleKey}:${src}`;
      if (pendingKeys.current.has(key)) throw new Error("Duplicate request");
      pendingKeys.current.add(key);
      if (excludedRef.current.has(key)) {
        await Reader.removeExcludedTitle({
          title_key: item.titleKey,
          source: src,
        } as Record<string, unknown>);
        return { isExcl: true, key };
      }
      await Reader.addExcludedTitle({
        title_key: item.titleKey,
        title: item.title,
        source: src,
        cover: item.cover ?? null,
        series_url: item.seriesUrl ?? null,
      } as Record<string, unknown>);
      return { isExcl: false, key };
    },
    onMutate: (item) => setExcludingKey(item.titleKey),
    onSuccess: ({ isExcl, key }) => {
      if (isExcl) {
        setOptimisticExcluded((prev) => {
          const n = new Set(prev);
          n.delete(key);
          return n;
        });
        toast("Title shown again", "success");
      } else {
        setOptimisticExcluded((prev) => new Set(prev).add(key));
        toast("Excluded from feed", "success");
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat"] });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat-infinite"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.rssFeedInfinite() });
      queryClient.invalidateQueries({ queryKey: queryKeys.excludedTitles });
    },
    onError: (err) =>
      toast(err instanceof Error ? err.message : "Failed to exclude", "error"),
    onSettled: (_data, _e, vars) => {
      setExcludingKey(null);
      if (vars?.source) {
        pendingKeys.current.delete(
          `${vars.titleKey}:${vars.source.toLowerCase()}`
        );
      }
    },
  });

  const excludeSeriesMutation = useMutation({
    mutationFn: async (series: GroupedSeries) => {
      // Per-source: one row per distinct source in the grouped series
      const bySource = new Map<string, { titleKey: string; seriesUrl: string }>();
      for (const c of series.chapters as unknown as { titleKey: string; source: string; seriesUrl: string }[]) {
        if (!c.source) continue;
        const s = c.source.toLowerCase();
        if (!bySource.has(s)) bySource.set(s, { titleKey: c.titleKey || series.titleKey, seriesUrl: c.seriesUrl || series.seriesUrl });
      }
      // No source anywhere → nothing addressable to exclude (no 'all' scope)
      if (bySource.size === 0) throw new Error("Cannot exclude: series has no source");
      const distinctKeys = [...bySource.entries()].map(([s, v]) => `${v.titleKey}:${s}`);
      for (const k of distinctKeys) if (pendingKeys.current.has(k)) throw new Error("Duplicate request");
      for (const k of distinctKeys) pendingKeys.current.add(k);
      const excl = excludedRef.current;
      const isExcl = distinctKeys.every((k) => excl.has(k));
      if (isExcl) {
        for (const [s, v] of bySource) {
          await Reader.removeExcludedTitle({ title_key: v.titleKey, source: s } as Record<string, unknown>);
        }
        return { isExcl: true, keys: distinctKeys };
      }
      await Promise.all(
        [...bySource.entries()].map(([s, v]) =>
          Reader.addExcludedTitle({
            title_key: v.titleKey,
            title: series.title,
            source: s,
            cover: series.cover ?? null,
            series_url: v.seriesUrl ?? null,
          } as Record<string, unknown>)
        )
      );
      return { isExcl: false, keys: distinctKeys };
    },
    onMutate: (series) => setExcludingKey(series.titleKey),
    onSuccess: ({ isExcl, keys }) => {
      if (isExcl) {
        setOptimisticExcluded((prev) => {
          const n = new Set(prev);
          for (const k of keys) n.delete(k);
          return n;
        });
        toast("Title shown again", "success");
      } else {
        setOptimisticExcluded((prev) => new Set([...prev, ...keys]));
        toast("Excluded from feed", "success");
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat"] });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat-infinite"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.rssFeedInfinite() });
      queryClient.invalidateQueries({ queryKey: queryKeys.excludedTitles });
    },
    onError: (err) =>
      toast(err instanceof Error ? err.message : "Failed to exclude", "error"),
    onSettled: (_data, _err, vars) => {
      setExcludingKey(null);
      if (vars) {
        for (const c of vars.chapters as unknown as { titleKey: string; source: string; seriesUrl: string }[]) {
          if (!c.source) continue;
          pendingKeys.current.delete(
            `${c.titleKey || vars.titleKey}:${c.source.toLowerCase()}`
          );
        }
      }
    },
  });

  const handleAdd = useCallback((item: FlatChapter) => addMutation.mutate(item), [addMutation]);
  const handleAddGroup = useCallback((series: GroupedSeries) => addGroupMutation.mutate(series), [addGroupMutation]);
  const handleAddGroupSource = useCallback(
    (series: GroupedSeries, source: string) =>
      addGroupSourceMutation.mutate({ series, source }),
    [addGroupSourceMutation]
  );
  const handleExclude = useCallback(
    (item: FlatChapter) => excludeMutation.mutate(item),
    [excludeMutation]
  );
  const handleExcludeSeries = useCallback(
    (series: GroupedSeries) => excludeSeriesMutation.mutate(series),
    [excludeSeriesMutation]
  );

  return {
    optimisticWhitelist,
    optimisticExcluded,
    excludingKey,
    addingKey,
    handleAdd,
    handleAddGroup,
    handleAddGroupSource,
    handleExclude,
    handleExcludeSeries,
  } as const;
}
