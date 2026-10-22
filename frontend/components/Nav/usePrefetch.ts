"use client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, staleTimes, gcTimes } from "@/lib/queryKeys";
import { Reader } from "@/lib/reader";

export function usePrefetch() {
  const qc = useQueryClient();
  return (href: string) => {
    switch (href) {
      case "/":
        qc.prefetchQuery({
          queryKey: queryKeys.dashboardSnapshot,
          queryFn: () => Reader.getDashboardSnapshot() as Promise<unknown>,
          staleTime: staleTimes.dashboard,
          gcTime: gcTimes.dashboard,
        });
        break;
      case "/recent":
        qc.prefetchQuery({
          queryKey: queryKeys.rssFeedInfinite(undefined, 100, null, false, null),
          queryFn: () => Reader.getRssFlatPage(1, 100, {}),
          staleTime: staleTimes.rss,
          gcTime: gcTimes.rss,
        });
        break;
      case "/whitelist":
        qc.prefetchQuery({
          queryKey: queryKeys.whitelist(false),
          queryFn: () =>
            Reader.getWhitelist(1, 1000, false) as Promise<unknown>,
          staleTime: staleTimes.whitelist,
          gcTime: gcTimes.whitelist,
        });
        break;
      case "/dispatch-history":
        qc.prefetchQuery({
          queryKey: queryKeys.dispatchHistory(),
          queryFn: () => Reader.getDispatchHistory(1, 1000) as Promise<unknown>,
          staleTime: staleTimes.dispatch,
          gcTime: gcTimes.dispatch,
        });
        break;
      case "/exclude-list":
        qc.prefetchQuery({
          queryKey: queryKeys.excludedTitles,
          queryFn: () => Reader.getExcludedTitles() as Promise<unknown>,
          staleTime: staleTimes.excluded,
          gcTime: gcTimes.excluded,
        });
        break;
      case "/status":
        qc.prefetchQuery({
          queryKey: ["watchdog"],
          queryFn: () =>
            fetch("/api/v1/watchdog", { credentials: "include" })
              .then((r) => r.json())
              .then((j) => j?.data ?? j),
          staleTime: 30_000,
        });
        break;
    }
  };
}
