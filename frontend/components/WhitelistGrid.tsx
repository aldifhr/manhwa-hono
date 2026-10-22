"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Reader } from "@/lib/reader";
import type { WhitelistRouteItem } from "@/lib/types";
import { queryKeys, staleTimes, gcTimes } from "@/lib/queryKeys";
import { MangaCardSkeleton } from "@/components/MangaCard";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useDebounced } from "@/lib/useDebounced";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/EmptyState";
import { ErrorFallback } from "@/components/ErrorFallback";
import { Select } from "@/components/ui/Select";
import { CompactSearchInput } from "@/components/ui/SearchInput";
import { useWhitelistFilters } from "@/components/home/hooks/useWhitelistFilters";
import { WhitelistCard } from "@/components/WhitelistCard";
import { useCustomLists, type ListName } from "@/hooks/useCustomLists";
import { useToast } from "@/lib/useToast";

export function WhitelistGrid() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.whitelist(false),
    queryFn: () =>
      Reader.getWhitelist(1, 1000, false) as unknown as Promise<
        WhitelistRouteItem[]
      >,
    staleTime: staleTimes.whitelist,
    gcTime: gcTimes.whitelist,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const [sourceFilter, setSourceFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounced(searchTerm, 300);
  const [sort, setSort] = useState<"title" | "rating" | "recent">("title");
  const [listTab, setListTab] = useState<"all" | ListName>("all");
  const { map: customMap, setList } = useCustomLists();

  const [catalogSearch, setCatalogSearch] = useState("");
  const debouncedCatalogSearch = useDebounced(catalogSearch, 400);
  const [ctxMenu, setCtxMenu] = useState<{ k: string; x: number; y: number } | null>(null);
  const { data: catalogResults } = useQuery({
    queryKey: queryKeys.catalogSearch(debouncedCatalogSearch),
    queryFn: () => Reader.searchCatalog(debouncedCatalogSearch),
    enabled: debouncedCatalogSearch.length > 0,
    staleTime: staleTimes.catalogSearch,
    gcTime: gcTimes.catalogSearch,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const addCatalog = useMutation({
    mutationFn: (c: Record<string, unknown>) =>
      Reader.addWhitelistEntry({
        title: c.title,
        seriesUrl: typeof c.url === "string" && c.url ? c.url : undefined,
        source: c.source,
        title_key: c.titleKey,
        cover: typeof c.cover === "string" && c.cover ? c.cover : undefined,
        rating: typeof c.rating === "number" ? c.rating : undefined,
        origin: typeof c.origin === "string" && c.origin ? c.origin : undefined,
        genres:
          Array.isArray(c.genres) && c.genres.length
            ? (c.genres as string[])
            : undefined,
        description:
          typeof c.description === "string" && c.description
            ? c.description
            : undefined,
      } as Record<string, unknown>) as Promise<{ status?: string }>,
    onSuccess: (_d, c) => {
      toast(`Added ${String(c.title)} to whitelist`, "success");
      queryClient.invalidateQueries({ queryKey: queryKeys.whitelistAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.whitelist(false) });
    },
    onError: (_e, c) => {
      toast(`Failed to add ${String(c.title)}`, "error");
    },
  });

  const items = data ?? [];
  const filteredByList = listTab === "all" ? items : items.filter(it => {
    const k = (it as any).titleKey || (it as any).title_key || it.id;
    const v = customMap[k] || (it as any).status?.toLowerCase();
    return v === listTab;
  });
  const filtered = useWhitelistFilters(filteredByList, {
    sourceFilter,
    typeFilter,
    debouncedSearch,
    sort,
  });

  const sources = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.source) set.add(i.source);
      if (Array.isArray(i.sources))
        i.sources.forEach((s: string | { source: string }) => {
          const v =
            typeof s === "string" ? s : (s as { source: string }).source;
          if (v) set.add(v);
        });
    });
    return [...set].sort();
  }, [items]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Search skeleton */}
        <div className="flex items-center justify-between gap-2">
          <div className="skeleton h-8 w-48 rounded-lg" />
          <div className="flex items-center gap-2">
            <div className="skeleton h-8 w-20 rounded-lg" />
          </div>
        </div>

        {/* Filters skeleton */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="skeleton h-8 w-24 rounded-lg" />
          <div className="skeleton h-8 w-28 rounded-lg" />
          <div className="skeleton h-8 w-24 rounded-lg" />
          <div className="skeleton h-8 w-28 rounded-lg" />
          <div className="skeleton h-7 w-14 rounded-lg" />
          <div className="skeleton h-4 w-16 rounded ml-auto" />
        </div>

        {/* Grid skeleton — co-located with MangaCard for locality */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <MangaCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorFallback
        title="Failed to load data"
        message={error instanceof Error ? error.message : "An error occurred"}
        onRetry={() => refetch()}
        icon="warning"
      />
    );
  }

  const catalogItems = Array.isArray(catalogResults) ? catalogResults : [];
  const isCatalogSearching = debouncedCatalogSearch.length > 0;

  return (
    <div className="space-y-4">
      {/* Catalog search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlass
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search catalog..."
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            data-search-input="catalog"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface border border-border text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>


      </div>

      <div className="flex items-center justify-between gap-2">
        <CompactSearchInput value={searchTerm} onChange={setSearchTerm} />
      </div>

      {/* Custom Lists tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {(["all", "reading", "plan", "completed", "dropped"] as const).map(tab => {
          const label = tab === "all" ? "All" : tab === "plan" ? "Plan to Read" : tab.charAt(0).toUpperCase() + tab.slice(1);
          const count = tab === "all" ? items.length : items.filter(it => {
            const k = (it as any).titleKey || (it as any).title_key || it.id;
            return (customMap[k] || (it as any).status?.toLowerCase()) === tab;
          }).length;
          const active = listTab === tab;
          return (
            <button key={tab} onClick={() => setListTab(tab)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? "bg-white text-black border-white" : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"}`}>
              {label} <span className={`ml-1 ${active ? "text-black/50" : "text-white/30"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          ariaLabel="Filter by source"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={[
            { value: "All", label: "Source: All" },
            ...sources.map((s) => ({ value: s, label: s })),
          ]}
        />

        {/* Type filter */}
        <Select
          ariaLabel="Filter by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: "All", label: "Type: All" },
            { value: "manhwa", label: "Manhwa" },
            { value: "manhua", label: "Manhua" },
            { value: "manga", label: "Manga" },
          ]}
        />

        {/* Sort */}
        <Select
          ariaLabel="Sort by"
          value={sort}
          onChange={(e) =>
            setSort(e.target.value as "title" | "rating" | "recent")
          }
          options={[
            { value: "title", label: "Sort: A–Z" },
            { value: "rating", label: "Sort: Rating" },
            { value: "recent", label: "Sort: Recent" },
          ]}
        />

        {(sourceFilter !== "All" || typeFilter !== "All" || debouncedSearch !== "" || sort !== "recent") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSourceFilter("All");
              setTypeFilter("All");
              setSearchTerm("");
              setSort("recent");
            }}
          >
            Reset
          </Button>
        )}

        <span className="text-xs text-text-muted ml-auto">
          {filtered.length} / {items.length}
        </span>
      </div>

      {/* Catalog results */}
      {isCatalogSearching && catalogItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">
            Catalog results ({catalogItems.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {catalogItems.map((item, i) => {
              const c = item as Record<string, unknown>;
              return (
                <div
                  key={`catalog-${i}-${String(c.id ?? c.title ?? i)}`}
                  className="rounded-lg border border-border bg-surface p-2 hover:ring-1 hover:ring-accent transition-colors"
                >
                  {c.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={String(c.coverUrl ?? c.cover_image_url ?? c.coverImageUrl)}
                      alt={String(c.title ?? "")}
                      className="w-full aspect-[3/4] object-cover rounded mb-2"
                    />
                  ) : (
                    <div className="w-full aspect-[3/4] rounded bg-white/5 mb-2 flex items-center justify-center">
                      <MagnifyingGlass size={20} className="text-white/20" />
                    </div>
                  )}
                  <p className="text-xs text-text truncate">
                    {String(c.title ?? "Untitled")}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    <span className="text-[10px] text-text-muted truncate">
                      {String(c.source ?? "")}
                      {typeof c.origin === "string" && c.origin
                        ? ` · ${c.origin}`
                        : ""}
                    </span>
                    {c.isInWhitelist ? (
                      <span className="text-[10px] text-text-muted shrink-0">
                        In whitelist
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={addCatalog.isPending}
                        onClick={() =>
                          addCatalog.mutate(c as Record<string, unknown>)
                        }
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-white/10 hover:bg-white/20 text-text transition-colors disabled:opacity-50 shrink-0"
                      >
                        <Plus size={10} weight="bold" />
                        Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isCatalogSearching && catalogItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <EmptyState
            icon={<MagnifyingGlass />}
            message="No catalog results"
            subMessage={`Nothing found for "${debouncedCatalogSearch}"`}
          />
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <EmptyState
            icon={<MagnifyingGlass />}
            message="No manga found"
            subMessage="Try adjusting the search above"
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map((item) => {
              const k = (item as any).titleKey || (item as any).title_key || item.id;
              const cur = customMap[k] as ListName | undefined;
              return (
              <div
                key={`${item.id}:${item.source}`}
                className="group/card relative flex flex-col"
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ k, x: e.clientX, y: e.clientY }); }}
              >
                <WhitelistCard item={item} onRefetch={refetch} />
              </div>
              );
            })}
          </div>
          {ctxMenu && (
            <div className="fixed inset-0 z-[100] bg-transparent" onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }}>
              <div
                className="absolute bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl py-1 text-[11px] w-fit min-w-28 overflow-hidden flex flex-col"
                style={{ left: Math.min(ctxMenu.x, typeof window !== "undefined" ? window.innerWidth - 140 : ctxMenu.x), top: Math.min(ctxMenu.y, typeof window !== "undefined" ? window.innerHeight - 150 : ctxMenu.y) }}
                onClick={e => e.stopPropagation()}
              >
                {(["reading", "plan", "completed", "dropped"] as ListName[]).map(v => {
                  const label = v === "plan" ? "Plan to Read" : v.charAt(0).toUpperCase() + v.slice(1);
                  const active = customMap[ctxMenu.k] === v;
                  return (
                    <button key={v} onClick={() => { setList(ctxMenu.k, v); setCtxMenu(null); }} className={`w-fit min-w-full text-left px-2.5 py-1 cursor-pointer border-0 bg-transparent leading-none whitespace-nowrap ${active ? "text-white" : "text-zinc-200"}`}>
                      {active ? "✓ " : ""}{label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
