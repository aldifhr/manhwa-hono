"use client";
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUiStore } from "./uiStore";

const KEYS = ["source", "q", "type", "country", "feed", "group"] as const;

export function useUiUrlSync() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useRef(false);

  // URL → store on mount + setiap params berubah (back/forward, soft nav)
  useEffect(() => {
    const s = params;
    if (!s) return;
    const source = s.get("source");
    const q = s.get("q");
    const type = s.get("type");
    const feed = s.get("feed") as "all" | "nowl" | "wl" | null;
    const group = s.get("group");
    const store = useUiStore.getState();
    // first mount: set semua, next nav: sync ulang biar tidak stuck
    if (source !== null) store.setSourceFilter(source || null);
    else if (hydrated.current) store.setSourceFilter(null);
    if (q !== null) store.setSearchQuery(q);
    else if (hydrated.current) store.setSearchQuery("");
    if (type !== null) store.setTypeFilter(type || null);
    else if (hydrated.current) store.setTypeFilter(null);
    if (feed && ["all", "nowl", "wl"].includes(feed)) store.setFeed(feed as "all" | "nowl" | "wl");
    else if (hydrated.current && feed === null) store.setFeed("all");
    if (group !== null) {
      const want = group === "1";
      if (want !== store.groupMode) store.toggleGroupMode();
    } else if (hydrated.current && store.groupMode) {
      store.toggleGroupMode();
    }
    hydrated.current = true;
  }, [params]);

  // store → URL (debounced q)
  const sourceFilter = useUiStore((s) => s.sourceFilter);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const typeFilter = useUiStore((s) => s.typeFilter);
  const feed = useUiStore((s) => s.feed);
  const groupMode = useUiStore((s) => s.groupMode);

  useEffect(() => {
    if (!hydrated.current) return;
    const sp = new URLSearchParams(window.location.search);
    // source
    if (sourceFilter) sp.set("source", sourceFilter); else sp.delete("source");
    if (searchQuery) sp.set("q", searchQuery); else sp.delete("q");
    if (typeFilter) sp.set("type", typeFilter); else sp.delete("type");
    if (feed !== "all") sp.set("feed", feed); else sp.delete("feed");
    if (groupMode) sp.set("group", "1"); else sp.delete("group");
    const next = sp.toString();
    const cur = window.location.search.replace(/^\?/, "");
    if (next !== cur) router.replace(next ? `?${next}` : window.location.pathname, { scroll: false });
  }, [sourceFilter, searchQuery, typeFilter, feed, groupMode, router]);
}
