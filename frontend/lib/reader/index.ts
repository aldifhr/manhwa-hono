// Deep module: Reader — seam untuk semua fetch whitelist/history/rss.
// Interface adalah test surface; di balik seam: pagination, snake→camel, csrf, 401.
// Transport + mapper dipisah biar testable (inject fetch, unit test mapper tanpa network).
import type {
  QueueDepth,
  DashboardSnapshot,
  ExcludedTitleItem,
  DispatchHistoryItem,
} from "@/lib/types";
import { readerFetch, paginatedGet } from "./transport";
import { mapWhitelist, mapHistory, mapRss, mapExcluded } from "./mapper";

function buildRssParams(
  page: number,
  limit: number,
  opts: {
    exclude?: string;
    whitelist?: boolean;
    source?: string | null;
    type?: string | null;
  }
) {
  const p = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    group: "false",
  });
  if (opts.exclude) p.set("exclude", opts.exclude);
  if (opts.whitelist) p.set("whitelist", "true");
  if (opts.source) p.set("source", opts.source);
  if (opts.type) { p.set("type", opts.type); p.set("format", opts.type); }
  return p;
}

export const Reader = {
  getWhitelist: (page = 1, pageSize = 1000, merge = false) => {
    const p = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      merge: merge ? "true" : "false",
    });
    return paginatedGet(
      "/api/v1/whitelist",
      p,
      mapWhitelist,
      undefined,
      fetch,
      1000
    ) as unknown as Promise<import("@/lib/types").WhitelistRouteItem[]>;
  },
  /** @deprecated */
  getDispatchHistory: async (
    page = 1,
    pageSize = 1000,
    search = ""
  ): Promise<import("@/lib/types").DispatchHistoryItem[]> => {
    try {
      const p = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (search) p.set("search", search);
      return (await paginatedGet(
        "/api/v1/dispatch-history",
        p,
        mapHistory,
        undefined,
        fetch,
        1000
      )) as unknown as import("@/lib/types").DispatchHistoryItem[];
    } catch (e) {
      if (
        (e as Error).message.includes("401") ||
        (e as Error).message.includes("403")
      )
        return [];
      throw e;
    }
  },
  getDispatchHistoryPage: async (
    page = 1,
    pageSize = 50,
    search = ""
  ): Promise<{
    results: import("@/lib/types").DispatchHistoryItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> => {
    const p = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (search) p.set("search", search);
    const data = await readerFetch<{
      success: boolean;
      data: {
        results: unknown[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      };
    }>(`/api/v1/dispatch-history?${p}`);
    const d = data.data as {
      results: unknown[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      total_pages?: number;
    };
    return {
      results: (d?.results ?? []).map(
        (r) => mapHistory(r) as unknown as DispatchHistoryItem
      ),
      total: d?.total ?? 0,
      page: d?.page ?? page,
      pageSize: d?.pageSize ?? pageSize,
      totalPages:
        d?.totalPages ?? (d as { total_pages?: number })?.total_pages ?? 1,
    };
  },
  /** @deprecated */
  getRssFlat: (
    page = 1,
    limit = 100,
    opts: {
      exclude?: string;
      whitelist?: boolean;
      source?: string | null;
      type?: string | null;
    } = {}
  ) =>
    paginatedGet(
      "/api/v1/rss",
      buildRssParams(page, limit, opts),
      mapRss,
      undefined,
      fetch,
      100 // RSS hard cap 100 — keep fan-out only if caller >100 (legacy)
    ) as unknown as Promise<import("@/lib/types").RssFlatItem[]>,
  getExcludedTitles: async (): Promise<ExcludedTitleItem[]> => {
    try {
      const data = await readerFetch<{
        success: boolean;
        data: { results: Record<string, unknown>[] };
      }>("/api/v1/excluded-titles");
      return (data.data?.results ?? []).map(mapExcluded) as ExcludedTitleItem[];
    } catch (e) {
      if (
        (e as Error).message.includes("401") ||
        (e as Error).message.includes("403")
      )
        return [];
      throw e;
    }
  },
  getDashboardSnapshot: async (): Promise<DashboardSnapshot | null> => {
    try {
      const data = await readerFetch<{
        success: boolean;
        data: DashboardSnapshot;
      }>("/api/v1/dashboard-snapshot");
      return (data.data ?? null) as DashboardSnapshot | null;
    } catch (e) {
      if (
        (e as Error).message.includes("401") ||
        (e as Error).message.includes("403")
      )
        return null;
      throw e;
    }
  },
  getStats: async () => {
    try {
      const data = await readerFetch<{ success: boolean; data: unknown }>(
        "/api/v1/stats"
      );
      return (data.data ?? null) as unknown;
    } catch (e) {
      if (
        (e as Error).message.includes("401") ||
        (e as Error).message.includes("403")
      )
        return null;
      throw e;
    }
  },
  getQueueDepth: async (): Promise<QueueDepth> => {
    try {
      const data = await readerFetch<{ success: boolean; data: unknown }>(
        "/api/v1/queue"
      );
      return (data.data ?? {}) as QueueDepth;
    } catch (e) {
      if (
        (e as Error).message.includes("401") ||
        (e as Error).message.includes("403")
      )
        return {} as QueueDepth;
      throw e;
    }
  },
  getCronStatus: async () => {
    const data = await readerFetch<{ success: boolean; data: unknown }>(
      "/api/v1/cron/status"
    );
    return (data.data ?? []) as unknown;
  },
  countNewSince: async (lastSeen: number, opts?: { distinct?: boolean }) => {
    const distinct = opts?.distinct ?? true;
    const qs = distinct ? `&distinct=title` : `&distinct=chapter`;
    const data = await readerFetch<{
      success: boolean;
      data: { newCount?: number; newCountDistinct?: number };
    }>(`/api/v1/rss/new?since=${lastSeen}${qs}`);
    const count = distinct
      ? (data?.data?.newCountDistinct ?? data?.data?.newCount)
      : data?.data?.newCount;
    if (typeof count === "number" && Number.isFinite(count)) return count;
    throw new Error("Invalid newCount from /api/v1/rss/new");
  },
  getRssHealth: async () => {
    const data = await readerFetch<{ success: boolean; data: unknown }>(
      "/api/v1/rss/health"
    );
    return data.data as unknown;
  },
  getCronMonitor: async () => {
    const data = await readerFetch<Record<string, unknown>>(
      "/api/v1/cron/status"
    );
    return data as unknown;
  },
  // Analytics endpoints
  getAnalyticsOverview: async () => {
    const data = await readerFetch<{ success: boolean; data: unknown }>(
      "/api/v1/analytics/overview"
    );
    return (data.data ?? null) as unknown;
  },
  getAnalyticsSeriesDetail: async (titleKey: string) => {
    const data = await readerFetch<{ success: boolean; data: unknown }>(
      `/api/v1/analytics/series/${encodeURIComponent(titleKey)}`
    );
    return (data.data ?? null) as unknown;
  },
  getAnalyticsEngagement: async () => {
    const data = await readerFetch<{ success: boolean; data: unknown }>(
      "/api/v1/analytics/engagement"
    );
    return (data.data ?? null) as unknown;
  },
  getRssFilterMetadata: async () => {
    const data = await readerFetch<{ success: boolean; data: unknown }>(
      "/api/v1/rss/filters/metadata"
    );
    return (data.data ?? null) as unknown;
  },
  // Whitelist mutations — single seam so api.ts has no bare fetch
  addWhitelistEntry: async (data: Record<string, unknown>) => {
    try {
      const res = await readerFetch<{ status?: string; success?: boolean }>(
        "/api/v1/whitelist",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      return { status: "added" as const };
    } catch (e) {
      const msg = (e as Error).message;
      if (
        msg.includes("409") ||
        msg.toLowerCase().includes("already_exists") ||
        msg.toLowerCase().includes("already exists")
      ) {
        return { status: "already_exists" as const };
      }
      throw e;
    }
  },
  removeWhitelistEntry: async (data: Record<string, unknown>) => {
    try {
      const res = await readerFetch<{
        status?: string;
        deleted?: number;
        success?: boolean;
        error?: string | { message?: string };
      }>("/api/v1/whitelist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (
        (res as unknown as { status?: string }).status === "not_found" ||
        (res as unknown as { deleted?: number }).deleted === 0
      ) {
        throw new Error("No matching whitelist entry to delete");
      }
      return;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("404") || msg.toLowerCase().includes("not_found")) {
        throw new Error("No matching whitelist entry to delete");
      }
      throw e;
    }
  },
  addExcludedTitle: async (data: Record<string, unknown>) => {
    const res = await readerFetch<{ success?: boolean; data?: unknown }>(
      "/api/v1/excluded-titles",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );
    return { status: "ok" as const };
  },
  removeExcludedTitle: async (data: Record<string, unknown>) => {
    await readerFetch("/api/v1/excluded-titles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
  bulkExcludeBySource: async (source: string) => {
    const data = await readerFetch<{
      success: boolean;
      data: { excluded: number };
    }>("/api/v1/excluded-titles/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
    return { excluded: data.data?.excluded ?? 0 };
  },
  // Page-wise seam for AllTab infinite scroll — hides snake→camel + hasMore logic
  async getRssFlatPage(
    page: number,
    limit = 100,
    opts: {
      exclude?: string;
      whitelist?: boolean;
      source?: string | null;
      type?: string | null;
    } = {}
  ): Promise<{
    results: Record<string, unknown>[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const p = buildRssParams(page, limit, opts);
    const data = await readerFetch<{
      success: boolean;
      data: {
        results: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        hasMore: boolean;
      };
    }>(`/api/v1/rss?${p}`);
    const d = data.data;
    const results = (d?.results ?? []).map(mapRss) as Record<string, unknown>[];
    const totalPages =
      (d?.totalPages as number) ??
      (d as unknown as { total_pages?: number })?.total_pages;
    const fallbackHasMore =
      typeof totalPages === "number"
        ? page < totalPages
        : results.length === limit && results.length > 0;
    return {
      results,
      total: d?.total ?? 0,
      page: d?.page ?? page,
      pageSize: d?.pageSize ?? limit,
      totalPages: totalPages ?? 1,
      hasMore: typeof d?.hasMore === "boolean" ? d.hasMore : fallbackHasMore,
    };
  },

  // ── Additional orphaned BE routes now exposed to FE ──

  getActivityHeatmap: async () => {
    const data = await readerFetch<{ success: boolean; data: unknown }>("/api/v1/activity/heatmap");
    return (data.data ?? null) as unknown;
  },

  getAnalyticsRetention: async () => {
    const data = await readerFetch<{ success: boolean; data: unknown }>("/api/v1/analytics/retention");
    return (data.data ?? null) as unknown;
  },

  searchCatalog: async (query: string) => {
    const p = new URLSearchParams({ q: query });
    const data = await readerFetch<{
      success: boolean;
      data: { results?: unknown[] } | unknown[] | null;
    }>(`/api/v1/catalog/search?${p}`);
    // Backend wraps rows as {results, count}; tolerate a bare array too.
    const payload = data.data;
    const rows = Array.isArray(payload)
      ? payload
      : ((payload as { results?: unknown[] } | null)?.results ?? null);
    return rows as unknown;
  },

  getCatalogStats: async () => {
    const data = await readerFetch<{ success: boolean; data: unknown }>("/api/v1/catalog/stats");
    return (data.data ?? null) as unknown;
  },

  getFailedDispatchesQueue: async () => {
    const data = await readerFetch<{ success: boolean; data: unknown }>("/api/v1/failed-dispatches/queue");
    return (data.data ?? null) as unknown;
  },

  getSourcesHealth: async () => {
    const data = await readerFetch<{ success: boolean; data: unknown }>("/api/v1/sources/health");
    return data.data as unknown;
  },

  getReaderBadgeCounts: async () => {
    const data = await readerFetch<{ success: boolean; data: unknown }>("/api/v1/reader/badge-counts");
    return data.data as unknown;
  },

  addWhitelistBE: async (data: Record<string, unknown>) => {
    return readerFetch("/api/v1/whitelist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  },

  updateWhitelistBE: async (data: Record<string, unknown>) => {
    return readerFetch("/api/v1/whitelist", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  },

  testErrorLog: async () => {
    await readerFetch("/api/v1/logs/errors/test", { method: "POST" });
  },

};
