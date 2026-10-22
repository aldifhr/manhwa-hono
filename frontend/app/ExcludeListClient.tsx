"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Reader } from "@/lib/reader";
import { ALL_SOURCES } from "@/lib/constants";
import { sourceBadgeClass } from "@/lib/styles";
import type { ExcludedTitleItem } from "@/lib/types";
import { queryKeys, staleTimes, gcTimes } from "@/lib/queryKeys";
import { useToast } from "@/lib/useToast";
import { MagnifyingGlass, Prohibit, Trash, Plus } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/EmptyState";
import { Select } from "@/components/ui/Select";
import { useDebounced } from "@/lib/useDebounced";
import { decodeHtml } from "@/lib/utils";
import { PageShell } from "@/components/PageShell";

// Sentinel for "no source filter" in the UI. Deliberately NOT "all" —
// "all" is not a source, and reusing it made the filter indistinguishable
// from a (former) global-exclude scope.
const FILTER_ALL = "*";

function SourceBadge({ source }: { source: string }) {
  const color = sourceBadgeClass(source);
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}>
      {source}
    </span>
  );
}

export function ExcludeListClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.excludedTitles,
    queryFn: () => Reader.getExcludedTitles() as Promise<ExcludedTitleItem[]>,
    staleTime: staleTimes.excluded,
    gcTime: gcTimes.excluded,
    refetchOnWindowFocus: false,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState(FILTER_ALL);
  const debouncedSearch = useDebounced(searchTerm, 300);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const items: ExcludedTitleItem[] = data ?? [];

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (debouncedSearch) {
        const t = (it.title || it.titleKey || "").toLowerCase();
        if (!t.includes(debouncedSearch.toLowerCase())) return false;
      }
      if (sourceFilter !== FILTER_ALL && it.source !== sourceFilter)
        return false;
      return true;
    });
  }, [items, debouncedSearch, sourceFilter]);

  const displayTitle = (it: ExcludedTitleItem) =>
    decodeHtml(it.title || it.titleKey || "Unknown title");

  const grouped = useMemo(() => {
    const map: Record<string, ExcludedTitleItem[]> = {};
    for (const it of filtered) {
      const s = it.source;
      if (!s) continue;
      (map[s] ??= []).push(it);
    }
    return map;
  }, [filtered]);

  const groupOrder = useMemo(() => {
    const present = Object.keys(grouped);
    // Stable, predictable order without hardcoding a source list.
    present.sort((a, b) => a.localeCompare(b));
    return present;
  }, [grouped]);

  // The source a bulk-exclude would hit — one definition, read by both the
  // handler and the button label so they can never disagree. Order: the
  // explicit filter, else the source that actually has excluded rows (you are
  // undoing what you can see), else the first targetable source.
  const bulkTarget = useMemo(() => {
    if (sourceFilter !== FILTER_ALL) return sourceFilter;
    const present = [...new Set(items.map((i) => i.source).filter(Boolean))].sort();
    return present[0] ?? ALL_SOURCES[0];
  }, [sourceFilter, items]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.source) set.add(i.source);
    });
    // Union with the known sources: the dropdown must offer every source you can
    // TARGET, not only the ones already carrying a row. Deriving it from `items`
    // alone meant a source with zero excludes could never be picked — and since
    // bulk-exclude falls back to sources[0], it could never be bulk-excluded
    // either. ALL_SOURCES is the same list the backend's EXCLUDE_SOURCES accepts.
    for (const s of ALL_SOURCES) set.add(s);
    return [...set].sort();
  }, [items]);

  const handleRemove = async (it: ExcludedTitleItem) => {
    if (!it.source) return;
    const key = `${it.titleKey || it.id}:${it.source}`;
    const prev =
      queryClient.getQueryData<ExcludedTitleItem[]>(queryKeys.excludedTitles) ??
      items;
    queryClient.setQueryData<ExcludedTitleItem[]>(
      queryKeys.excludedTitles,
      (old) =>
        (old ?? prev).filter(
          (x) =>
            !(
              (x.titleKey || x.id) === (it.titleKey || it.id) &&
              x.source === it.source
            )
        )
    );
    setBusyKey(key);
    try {
      const title_key = it.titleKey || it.id || it.title || "";
      if (!title_key) throw new Error("title_key missing");
      await Reader.removeExcludedTitle({
        title_key,
        source: it.source,
        title: it.title ?? undefined,
      } as unknown as Record<string, unknown>);
      toast(`Un-excluded ${displayTitle(it)}`, {
        type: "info",
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await Reader.addExcludedTitle({
                title_key: it.titleKey || it.id || "",
                title: it.title ?? undefined,
                source: it.source,
                cover: it.cover ?? null,
                series_url: it.seriesUrl ?? null,
              } as Record<string, unknown>);
              queryClient.invalidateQueries({
                queryKey: queryKeys.excludedTitles,
              });
              queryClient.invalidateQueries({ queryKey: ["rss-feed-flat"] });
              queryClient.invalidateQueries({ queryKey: ["rss-feed-flat-infinite"] });
              queryClient.invalidateQueries({ queryKey: queryKeys.rssFeedInfinite() });
              queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
              toast(`Re-excluded ${displayTitle(it)}`, { type: "success" });
            } catch {}
          },
        },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.excludedTitles });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat"] });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat-infinite"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.rssFeedInfinite() });
      queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
    } catch (err) {
      queryClient.setQueryData(queryKeys.excludedTitles, prev);
      toast(err instanceof Error ? err.message : "Failed to remove", {
        type: "error",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleBulk = async () => {
    // No "All" scope: bulk-exclude always targets one concrete source.
    // bulkTarget is the single definition the button label also reads, so what
    // you click is what runs.
    const src = bulkTarget;
    if (!src) return;
    const ok = window.confirm(`Exclude ALL ${src} titles from recent (up to 2000)? This will hide them from RSS.`);
    if (!ok) return;
    const before =
      queryClient.getQueryData<ExcludedTitleItem[]>(queryKeys.excludedTitles) ??
      items;
    setBusyKey("bulk");
    try {
      const res = await Reader.bulkExcludeBySource(src);
      queryClient.invalidateQueries({ queryKey: queryKeys.excludedTitles });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat"] });
      queryClient.invalidateQueries({ queryKey: ["rss-feed-flat-infinite"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.rssFeedInfinite() });
      queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
      let added: ExcludedTitleItem[] = [];
      try {
        const fresh = (await Reader.getExcludedTitles()) as ExcludedTitleItem[];
        const beforeSet = new Set(
          before.map((x) => `${x.titleKey || x.id}:${x.source ?? ""}`)
        );
        added = fresh.filter(
          (x) => !beforeSet.has(`${x.titleKey || x.id}:${x.source ?? ""}`)
        );
      } catch {}
      toast(`Excluded ${res.excluded} titles from ${src}`, {
        type: "success",
        action:
          added.length > 0
            ? {
                label: "Undo",
                onClick: async () => {
                  let undone = 0;
                  for (const it of added) {
                    try {
                      await Reader.removeExcludedTitle({
                        title_key: it.titleKey || it.id || "",
                        source: it.source,
                      } as Record<string, unknown>);
                      undone++;
                    } catch {}
                  }
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.excludedTitles,
                  });
                  queryClient.invalidateQueries({ queryKey: ["rss-feed-flat"] });
                  queryClient.invalidateQueries({ queryKey: ["rss-feed-flat-infinite"] });
                  queryClient.invalidateQueries({ queryKey: queryKeys.rssFeedInfinite() });
                  queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
                  toast(`Undid ${undone} excludes`, { type: "info" });
                },
              }
            : undefined,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Bulk exclude failed", {
        type: "error",
      });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-text">
          Exclude List
        </h1>
        {isLoading ? (
          <div className="skeleton h-3 w-20 rounded" />
        ) : (
          <span className="text-xs text-text-muted">
            {items.length} excluded
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlass
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search title..."
            aria-label="Search excluded titles"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface border border-border text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>

        <Select
          ariaLabel="Filter by source"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={[
            { value: FILTER_ALL, label: "Semua source" },
            ...sources.map((s) => ({ value: s, label: s })),
          ]}
        />

        <div className="flex items-center gap-1.5 ml-auto">
          <Button
            variant="danger"
            size="sm"
            onClick={handleBulk}
            disabled={busyKey === "bulk"}
            title={`Exclude every title from ${bulkTarget}`}
          >
            <Plus size={14} />
            {busyKey === "bulk" ? "Excluding..." : `Exclude all ${bulkTarget}`}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {(sources.length ? sources : [...ALL_SOURCES]).map((src) => (
            <div key={src} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="skeleton h-5 w-12 rounded" />
                <div className="skeleton h-3 w-20 rounded" />
              </div>
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-surface-hover/40"
                  >
                    <div className="skeleton w-12 h-16 rounded-lg shrink-0" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="skeleton h-3.5 w-3/4 rounded" />
                      <div className="skeleton h-2.5 w-1/3 rounded" />
                    </div>
                    <div className="skeleton w-8 h-8 rounded-full shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<Prohibit />}
          message="Failed to load exclude list"
          subMessage={
            error instanceof Error ? error.message : "An error occurred"
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Prohibit />}
          message="No excluded titles"
          subMessage="Titles you exclude will appear here and be hidden from the RSS feed and notifications."
        />
      ) : (
        <div className="space-y-6">
          {groupOrder.map((src) => {
            const list = grouped[src];
            return (
              <div key={src} className="space-y-2">
                <div className="flex items-center gap-2">
                  <SourceBadge source={src} />
                  <span className="text-xs font-medium text-text-muted">
                    {list.length} title{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {list.map((it, idx) => {
                    const key = `${it.titleKey || it.id}:${it.source ?? ""}`;
                    return (
                      <div
                        key={`${key}:${idx}`}
                        className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-surface-hover/40 hover:bg-surface-hover transition-colors"
                      >
                        <div className="relative shrink-0 w-12 h-16 rounded-lg overflow-hidden bg-surface">
                          {it.cover ? (
                            <img
                              src={it.cover}
                              alt={displayTitle(it)}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-text-muted">
                              <Prohibit size={16} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text truncate">
                            {displayTitle(it)}
                          </p>
                          <p className="text-[11px] text-text-muted truncate">
                            {it.source}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemove(it)}
                          disabled={busyKey === key}
                          aria-label="Remove from exclude list"
                          className="p-2 rounded-full text-text-muted hover:text-danger hover:bg-danger/15 transition-colors disabled:opacity-50"
                        >
                          <Trash size={16} weight="bold" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
