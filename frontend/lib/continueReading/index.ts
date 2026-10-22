import { useState, useEffect, useCallback, useRef } from "react";

export interface ContinueReadingEntry {
  title: string;
  titleKey: string;
  cover: string | null;
  source: string;
  lastChapter: string;
  chapterUrl: string;
  seriesUrl: string;
  origin: string;
  updatedAt: string;
}

const LS_KEY = "continue_reading";
const MAX_ENTRIES = 20;
const CR_URL = "/api/v1/continue-reading";

// — localStorage helpers —
function loadFromLS(): Map<string, ContinueReadingEntry> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(LS_KEY);
    const data: Record<string, ContinueReadingEntry> = raw ? JSON.parse(raw) : {};
    const m = new Map<string, ContinueReadingEntry>();
    for (const [k, v] of Object.entries(data))
      if (v?.titleKey && v?.updatedAt && v?.chapterUrl) m.set(k, v);
    return m;
  } catch {
    return new Map();
  }
}

function saveToLS(entries: Map<string, ContinueReadingEntry>): void {
  try {
    const sorted = [...entries.values()].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    const capped = sorted.slice(0, MAX_ENTRIES);
    localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(capped.map((e) => [e.titleKey, e]))));
  } catch {}
}

function clearLS(): void {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

// — API helpers —
async function apiLoad(): Promise<Map<string, ContinueReadingEntry>> {
  const res = await fetch(CR_URL, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${CR_URL} → ${res.status}`);
  const json = await res.json();
  const raw: Record<string, any> = (json?.data?.entries) || {};
  const m = new Map<string, ContinueReadingEntry>();
  for (const [k, v] of Object.entries(raw)) {
    if (!v?.titleKey || !v?.chapterUrl) continue;
    m.set(k, {
      title: v.title || v.titleKey || k,
      titleKey: v.titleKey || k,
      cover: v.cover ?? null,
      source: v.source || "unknown",
      lastChapter: v.chapter || v.lastChapter || "?",
      chapterUrl: v.chapterUrl || v.chapter_url,
      seriesUrl: v.seriesUrl || v.series_url || v.chapterUrl || v.chapter_url || "",
      origin: v.origin || "",
      updatedAt: v.updatedAt || v.updated_at || new Date().toISOString(),
    });
  }
  return m;
}

async function apiSave(entries: Map<string, ContinueReadingEntry>): Promise<void> {
  const entriesObj: Record<string, any> = {};
  for (const [k, e] of entries) {
    entriesObj[k] = {
      title_key: e.titleKey,
      title: e.title,
      cover: e.cover || "",
      source: e.source,
      chapter: e.lastChapter,
      chapter_url: e.chapterUrl,
      series_url: e.seriesUrl,
      origin: e.origin || "",
      updated_at: e.updatedAt,
    };
  }
  const res = await fetch(CR_URL + "/bulk", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries: entriesObj }),
  });
  if (!res.ok) throw new Error(`POST ${CR_URL}/bulk → ${res.status}`);
}

async function apiRemove(titleKey: string): Promise<void> {
  const res = await fetch(CR_URL, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title_key: titleKey }),
  });
  if (!res.ok) throw new Error(`DELETE ${CR_URL} → ${res.status}`);
}

async function apiClear(): Promise<void> {
  const res = await fetch(CR_URL, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`DELETE ${CR_URL} → ${res.status}`);
}

// — builder —
export function buildEntryFromChapter(ch: {
  title: string;
  titleKey: string;
  cover?: string | null;
  source: string;
  chapter?: string | null;
  chapterLabel?: string | null;
  chapterNumber?: number | string | null;
  chapterUrl?: string | null;
  url?: string | null;
  seriesUrl?: string | null;
  origin?: string | null;
}): ContinueReadingEntry | null {
  const titleKey = ch.titleKey?.trim();
  if (!titleKey) return null;
  const chapterUrl = (ch.chapterUrl || ch.url || ch.seriesUrl || "").trim();
  if (!chapterUrl) return null;
  const lastChapter =
    (ch.chapterLabel && String(ch.chapterLabel).trim()) ||
    (ch.chapterNumber != null ? String(ch.chapterNumber).trim() : "") ||
    (ch.chapter && String(ch.chapter).trim()) ||
    "?";
  return {
    title: ch.title || titleKey,
    titleKey,
    cover: ch.cover ?? null,
    source: ch.source || "unknown",
    lastChapter,
    chapterUrl,
    seriesUrl: ch.seriesUrl || chapterUrl,
    origin: ch.origin || "",
    updatedAt: new Date().toISOString(),
  };
}

// — hook —
export function useContinueReading() {
  const [entries, setEntries] = useState<Map<string, ContinueReadingEntry>>(() => new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  // Load on mount: localStorage first (fast), then API merge
  useEffect(() => {
    mountedRef.current = true;
    const localEntries = loadFromLS();
    if (localEntries.size > 0) setEntries(localEntries);

    // Async merge with API
    apiLoad()
      .then((apiEntries) => {
        if (!mountedRef.current) return;
        setEntries((prev) => {
          const merged = new Map(prev);
          // API wins for same key if newer
          for (const [k, apiEntry] of apiEntries) {
            const localEntry = merged.get(k);
            if (!localEntry || new Date(apiEntry.updatedAt) > new Date(localEntry.updatedAt)) {
              merged.set(k, apiEntry);
            }
          }
          // Keep local-only entries
          return merged;
        });
      })
      .catch(() => {
        // API failed (not logged in, network) — localStorage already loaded
      });

    return () => { mountedRef.current = false; };
  }, []);

  // Auto-save on change
  useEffect(() => {
    saveToLS(entries);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      apiSave(entries).catch(() => {});
    }, 500);
  }, [entries]);

  const trackReading = useCallback((entry: ContinueReadingEntry) => {
    if (!entry?.titleKey || !entry?.chapterUrl) return;
    setEntries((prev) => {
      const existing = prev.get(entry.titleKey);
      if (existing && new Date(entry.updatedAt) <= new Date(existing.updatedAt)) return prev;
      const next = new Map(prev);
      next.set(entry.titleKey, entry);
      if (next.size > MAX_ENTRIES) {
        const sorted = [...next.values()].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        const capped = new Map<string, ContinueReadingEntry>();
        for (const e of sorted.slice(0, MAX_ENTRIES)) capped.set(e.titleKey, e);
        return capped;
      }
      return next;
    });
  }, []);

  const trackChapter = useCallback(
    (ch: Parameters<typeof buildEntryFromChapter>[0]) => {
      const entry = buildEntryFromChapter(ch);
      if (entry) trackReading(entry);
    },
    [trackReading]
  );

  const removeReading = useCallback((titleKey: string) => {
    setEntries((prev) => {
      const next = new Map(prev);
      next.delete(titleKey);
      return next;
    });
    apiRemove(titleKey).catch(() => {});
  }, []);

  const clearAll = useCallback(() => {
    setEntries(new Map());
    clearLS();
    apiClear().catch(() => {});
  }, []);

  return { entries, trackReading, trackChapter, removeReading, clearAll };
}
