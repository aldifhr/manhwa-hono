// Centralized TanStack Query keys — single source of truth to avoid typos
// (e.g. invalidating "dashboard" but querying "dashboardSnapshot" would silently no-op).

export const queryKeys = {
  whitelist: (merge = false) =>
    ["whitelist", merge ? "merged" : "separate"] as const,
  whitelistAll: ["whitelist"] as const,
  homeFeed: ["home-feed"] as const,
  rssFeedFlat: (
    exclude?: string,
    limit?: number,
    source?: string | null,
    whitelist = false,
    type?: string | null,
    page?: number
  ) =>
    [
      "rss-feed-flat",
      exclude ?? "",
      limit ?? 100,
      source ?? "all",
      whitelist,
      type ?? "all",
      page ?? 1,
    ] as const,
  // Infinite variant without page — pagination driven by useInfiniteQuery pageParam + cache
  //"rss"]
  // ["rss", {page,limit,exclude,whitelist,source,type}] bentuk tuple ini setara, urutan fixed
  rssFeedInfinite: (
    exclude?: string,
    limit?: number,
    source?: string | null,
    whitelist = false,
    type?: string | null
  ) =>
    [
      "rss-feed-flat-infinite",
      exclude ?? "",
      limit ?? 100,
      source ?? "all",
      whitelist,
      type ?? "all",
    ] as const,
  dispatchHistory: (search?: string) =>
    ["dispatch-history", search ?? ""] as const,
  dispatchHistoryPage: (search?: string, page?: number, pageSize?: number) =>
    ["dispatch-history-page", search ?? "", page ?? 1, pageSize ?? 50] as const,
  dashboardSnapshot: ["dashboard-snapshot"] as const,
  queueDepth: ["queue-depth"] as const,
  excludedTitles: ["excluded-titles"] as const,
  stats: ["stats"] as const,
  rssHealth: ["rss-health"] as const,
  cronStatus: ["cron-status"] as const,
  analyticsOverview: ["analytics-overview"] as const,
  analyticsEngagement: ["analytics-engagement"] as const,
  analyticsRetention: ["analytics-retention"] as const,
  catalogSearch: (q: string) => ["catalog-search", q] as const,
  rssFilterMetadata: ["rss-filter-metadata"] as const,
  rssHealthDetail: ["rss-health-detail"] as const,
};

export const staleTimes = {
  // RSS: cepat berubah → 15-30s fresh, lalu background refetch
  rss: 30_000,
  homeFeed: 30_000,
  dashboard: 60_000,
  // whitelist: cross-device harus cepat sinkron → 30s
  whitelist: 30_000,
  // dispatch: history tidak sering berubah
  dispatch: 5 * 60_000,
  dispatchPage: 2 * 60_000,
  excluded: 2 * 60_000,
  // metadata: jarang berubah → 30m-1h
  stats: 30 * 60_000,
  metadata: 30 * 60_000,
  rssFilterMetadata: 30 * 60_000,
  queue: 30_000,
  rssHealth: 30_000,
  cronStatus: 30_000,
  catalogSearch: 30_000,
} as const;

export const gcTimes = {
  rss: 5 * 60_000,
  homeFeed: 5 * 60_000,
  whitelist: 30 * 60_000,
  dispatch: 30 * 60_000,
  excluded: 30 * 60_000,
  stats: 60 * 60_000,
  metadata: 60 * 60_000,
  rssFilterMetadata: 60 * 60_000,
  dashboard: 5 * 60_000,
  catalogSearch: 5 * 60_000,
  queue: 5 * 60_000,
} as const;
