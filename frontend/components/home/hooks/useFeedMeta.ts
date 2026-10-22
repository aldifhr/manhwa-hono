"use client";
import { useMemo } from "react";
import { normalizeType } from "@/lib/feed";
import { ALL_SOURCES } from "@/lib/constants";
import type { FlatChapter } from "@/lib/feed";

export function useFeedMeta(
  all: FlatChapter[],
  optimisticWhitelist: Set<string>
) {
  const sources: string[] = useMemo(() => [...ALL_SOURCES], []);
  const typeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of all) {
      const raw = String((c as any).format ?? c.type ?? "").toLowerCase().trim();
      const t = normalizeType((c as any).format ?? c.type);
      map[t] = (map[t] || 0) + 1;
    }
    return map;
  }, [all]);
  const wlCount = useMemo(() => {
    const wlSet = new Set<string>();
    for (const c of all) {
      if (
        c.isWhitelisted ||
        optimisticWhitelist.has(`${c.titleKey}:${c.source}`)
      )
        wlSet.add(c.titleKey);
    }
    return wlSet.size;
  }, [all, optimisticWhitelist]);
  const distinctTotal = useMemo(
    () => new Set(all.map((c) => c.titleKey)).size,
    [all]
  );
  return {
    sources,
    typeCounts,
    wlCount,
    nowlCount: distinctTotal - wlCount,
    distinctTotal,
  };
}
