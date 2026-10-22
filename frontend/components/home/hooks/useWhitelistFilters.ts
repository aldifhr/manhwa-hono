"use client";
import { useMemo } from "react";
import { normalizeType } from "@/lib/feed";
import type { WhitelistRouteItem } from "@/lib/types";

export function useWhitelistFilters(
  items: WhitelistRouteItem[],
  opts: {
    sourceFilter: string;
    typeFilter: string;
    debouncedSearch: string;
    sort: "title" | "rating" | "recent";
  }
) {
  const { sourceFilter, typeFilter, debouncedSearch, sort } = opts;
  return useMemo(() => {
    const out = items.filter((item) => {
      if (
        debouncedSearch &&
        !String(item.title ?? "").toLowerCase().includes(String(debouncedSearch ?? "").toLowerCase())
      )
        return false;
      if (sourceFilter !== "All" && item.source !== sourceFilter) return false;
      if (typeFilter !== "All") {
        const t = normalizeType((item as any).format ?? item.type);
        if (t !== String(typeFilter ?? "").toLowerCase()) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "rating") {
        const ra = parseFloat(String(a.rating ?? "0")) || 0;
        const rb = parseFloat(String(b.rating ?? "0")) || 0;
        return rb - ra;
      }
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
    return out;
  }, [items, sourceFilter, typeFilter, debouncedSearch, sort]);
}
