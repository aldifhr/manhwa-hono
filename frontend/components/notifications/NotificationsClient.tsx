"use client";

import { useState, useMemo } from "react";
import { OriginFlag } from "@/components/ui/OriginFlag";
import { ALL_SOURCES, type SourceName } from "@/lib/constants";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { Reader } from "@/lib/reader";
import { readerFetch } from "@/lib/reader/transport";
import { queryKeys, staleTimes, gcTimes } from "@/lib/queryKeys";
import { useDebounced } from "@/lib/useDebounced";
import { timeAgo } from "@/lib/timeAgo";
import { decodeHtml, getChapterLabel, rewriteCoverUrl, safeUrl } from "@/lib/utils";
import { SourceBadge } from "@/components/ui/SourceBadge";
import type { DispatchHistoryItem } from "@/lib/types";
import {
  Bell,
  BookOpen,
  WarningCircle,
  MagnifyingGlass,
  LinkSimple,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import DispatchChart from "./DispatchChart";

type Tab = "all" | "chapters" | "log";

interface ErrorLog {
  id: string;
  level: string;
  source: string;
  scope?: string;
  message: string;
  created_at: string;
  meta?: { scope?: string; source?: string; [k: string]: unknown };
}

// Reuse rows
function ChapterRow({ item }: { item: DispatchHistoryItem }) {
  const cover = item.cover ? rewriteCoverUrl(item.cover) : null;
  const href = safeUrl(item.url) ?? safeUrl(item.seriesUrl);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-hover hover:bg-surface-active transition-colors">
      <div className="w-9 h-12 shrink-0 rounded-md overflow-hidden bg-surface border border-border">
        {cover ? (
          <img src={cover} alt={decodeHtml(item.title)} referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted text-xs font-bold">
            {decodeHtml(item.title).charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text truncate">{decodeHtml(item.title)}</span>
          <OriginFlag origin={item.origin} type={item.type} className="w-4 h-auto shrink-0" />
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
          <span className="font-medium text-accent">Ch. {getChapterLabel(item)}</span>
          <SourceBadge source={item.source} />
          <span>·</span>
          <span>{timeAgo(item.sentAt)}</span>
        </div>
      </div>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 p-2 rounded-md text-text-muted hover:text-accent hover:bg-surface transition-colors" aria-label="Open chapter">
          <LinkSimple size={16} />
        </a>
      )}
    </div>
  );
}

function LogRow({ log }: { log: ErrorLog }) {
  const src = log.source;
  const isProvider = ALL_SOURCES.includes(src as SourceName);
  const scopeLabel = log.meta?.scope ?? "system";
  return (
    <div className="bg-surface rounded-lg p-3 border border-border">
      <div className="flex items-center gap-2 text-xs">
        <span className={`px-2 py-0.5 rounded font-bold ${log.level === "error" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>{log.level}</span>
        {isProvider ? (
          <>
            <span className="text-white/40">{scopeLabel}</span>
            <span className="text-white/30">→</span>
            <SourceBadge source={src} />
          </>
        ) : (
          <span className="text-white/50">{src}</span>
        )}
        <span className="ml-auto text-white/30">{new Date(log.created_at).toLocaleString()}</span>
      </div>
      <p className="text-sm text-white/80 mt-1 break-words">{log.message}</p>
    </div>
  );
}

export default function NotificationsClient() {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"all" | SourceName>("all");
  const [pageChapters, setPageChapters] = useState(1);
  const [pageLog, setPageLog] = useState(1);
  const [qLog, setQLog] = useState("");
  const [logSource, setLogSource] = useState<"all" | SourceName>("all");
  const debouncedSearch = useDebounced(search, 300);
  const debouncedQLog = useDebounced(qLog, 300);
  const queryClient = useQueryClient();

  // Chapters query
  const chaptersQ = useQuery({
    queryKey: queryKeys.dispatchHistoryPage(debouncedSearch || undefined, pageChapters, 50),
    queryFn: () => Reader.getDispatchHistoryPage(pageChapters, 50, debouncedSearch || ""),
    staleTime: staleTimes.dispatchPage,
    gcTime: gcTimes.dispatch,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });

  // Log query
  const logQ = useQuery({
    queryKey: ["error-logs", pageLog, debouncedQLog, logSource] as const,
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(pageLog), page_size: "50" });
      if (debouncedQLog) p.set("q", debouncedQLog);
      if (logSource !== "all") p.set("source", logSource);
      const res = await readerFetch<{ success: boolean; data: { results: ErrorLog[]; total: number } }>(`/api/v1/logs/errors?${p}`);
      return res.data;
    },
    retry: false,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await readerFetch<{ success: boolean; deleted?: number; error?: string }>("/api/v1/logs/errors?clear_all=true", { method: "DELETE" });
      return res;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["error-logs"] });
    },
  });

  const chapters = (chaptersQ.data?.results ?? []) as DispatchHistoryItem[];
  const logs = (logQ.data?.results ?? []) as ErrorLog[];

  const filteredChapters = useMemo(() => {
    if (source === "all") return chapters;
    return chapters.filter((i) => i.source === source);
  }, [chapters, source]);

  // All merged timeline
  const merged = useMemo(() => {
    const cItems = filteredChapters.map((c) => ({ kind: "chapter" as const, at: c.sentAt, data: c }));
    const lItems = logs.map((l) => ({ kind: "log" as const, at: l.created_at, data: l }));
    const all = [...cItems, ...lItems].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    // simple search filter for All (search affects both)
    if (!debouncedSearch && !debouncedQLog) return all;
    const q = (debouncedSearch || debouncedQLog).toLowerCase();
    return all.filter((it) => {
      if (it.kind === "chapter") return (it.data as DispatchHistoryItem).title.toLowerCase().includes(q);
      return (it.data as ErrorLog).message.toLowerCase().includes(q) || (it.data as ErrorLog).source.toLowerCase().includes(q);
    });
  }, [filteredChapters, logs, debouncedSearch, debouncedQLog]);

  return (
    <PageShell>
      <div className="flex items-center gap-2 mb-1">
        <Bell size={22} className="text-accent" weight="bold" />
        <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
        <span className="text-xs px-2 py-1 rounded-full bg-surface text-text-muted ml-auto">
          {tab === "all" ? `${merged.length} items` : tab === "chapters" ? `${chaptersQ.data?.total ?? 0} chapters` : `${logQ.data?.total ?? 0} logs`}
        </span>
      </div>
      <p className="text-xs text-text-muted mb-4">All activity — chapters sent & system logs.</p>
      <DispatchChart />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-surface border border-border rounded-xl p-1 w-fit">
        {(["all", "chapters", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${tab === t ? "bg-accent text-accent-foreground shadow" : "text-text-muted hover:text-text"}`}
          >
            {t === "all" && <Bell size={14} />}
            {t === "chapters" && <BookOpen size={14} />}
            {t === "log" && <WarningCircle size={14} />}
            {t === "all" ? "All" : t === "chapters" ? "Chapters" : "Log"}
          </button>
        ))}
      </div>

      {/* Search / filters per tab */}
      {tab === "chapters" && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPageChapters(1); }} placeholder="Search title..." className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface border border-border text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
          <div className="flex gap-1">
            {(["all", ...ALL_SOURCES] as const).map((s) => (
              <button key={s} onClick={() => setSource(s)} className={`px-2.5 py-1.5 text-xs rounded-lg border ${source === s ? "bg-accent-dim border-accent/30 text-accent" : "bg-surface border-border text-text-secondary"}`}>{s}</button>
            ))}
          </div>
          <button onClick={() => chaptersQ.refetch()} className="ml-auto px-2.5 py-1.5 text-xs rounded-lg bg-surface border border-border">Refresh</button>
        </div>
      )}
      {tab === "log" && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={qLog} onChange={(e) => { setQLog(e.target.value); setPageLog(1); }} placeholder="Search source/message" className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface border border-border text-text placeholder:text-text-muted" />
          </div>
          <div className="flex gap-1">
            {(["all", ...ALL_SOURCES] as const).map((s) => (
              <button key={s} onClick={() => { setLogSource(s); setPageLog(1); }} className={`px-2.5 py-1.5 text-xs rounded-lg border ${logSource === s ? "bg-accent-dim border-accent/30 text-accent" : "bg-surface border-border text-text-secondary"}`}>{s}</button>
            ))}
          </div>
          <button onClick={() => logQ.refetch()} className="ml-auto px-2.5 py-1.5 text-xs rounded-lg bg-surface border border-border">Refresh</button>
          <button onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending} className="px-2.5 py-1.5 text-xs rounded-lg bg-red-500/15 text-red-300 disabled:opacity-50">{clearMutation.isPending ? "Clearing…" : "Clear All"}</button>
        </div>
      )}
      {tab === "all" && (
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search || qLog} onChange={(e) => { setSearch(e.target.value); setQLog(e.target.value); }} placeholder="Search chapters & logs..." className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface border border-border" />
          </div>
          <button onClick={() => { chaptersQ.refetch(); logQ.refetch(); }} className="px-2.5 py-1.5 text-xs rounded-lg bg-surface border border-border">Refresh</button>
        </div>
      )}

      {/* Content */}
      {tab === "chapters" && (
        <>
          {chaptersQ.isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
            : chaptersQ.error ? <div className="text-sm text-danger bg-danger-dim border border-danger/30 rounded-xl p-4">Failed to load</div>
            : filteredChapters.length === 0 ? <div className="text-center py-16 text-text-muted text-sm">No chapters</div>
            : <div className="space-y-1.5">{filteredChapters.map((it) => <ChapterRow key={`${it.titleKey}-${it.chapter}-${it.source}-${it.sentAt}`} item={it} />)}</div>}
          <div className="flex justify-between mt-4">
            <button disabled={pageChapters <= 1} onClick={() => setPageChapters((p) => p - 1)} className="px-3 py-1.5 text-xs rounded-lg border bg-surface border-border disabled:opacity-40">Prev</button>
            <span className="text-xs text-text-muted">Page {pageChapters} of {chaptersQ.data?.totalPages ?? 1}</span>
            <button disabled={pageChapters >= (chaptersQ.data?.totalPages ?? 1)} onClick={() => setPageChapters((p) => p + 1)} className="px-3 py-1.5 text-xs rounded-lg border bg-surface border-border disabled:opacity-40">Next</button>
          </div>
        </>
      )}

      {tab === "log" && (
        <>
          {logQ.isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
            : logQ.error ? <div className="text-sm text-danger bg-danger-dim border p-4 rounded-xl">{(logQ.error as Error).message}</div>
            : logs.length === 0 ? <div className="text-center py-16 text-text-muted text-sm">No logs — clean!</div>
            : <div className="space-y-2">{logs.map((l) => <LogRow key={l.id} log={l} />)}</div>}
          <div className="flex justify-between mt-4">
            <button disabled={pageLog <= 1} onClick={() => setPageLog((p) => p - 1)} className="px-3 py-1.5 text-xs rounded-lg border bg-surface disabled:opacity-40">Prev</button>
            <span className="text-xs text-text-muted">Page {pageLog}</span>
            <button onClick={() => setPageLog((p) => p + 1)} className="px-3 py-1.5 text-xs rounded-lg border bg-surface">Next</button>
          </div>
        </>
      )}

      {tab === "all" && (
        <>
          {(chaptersQ.isLoading || logQ.isLoading) ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
            : merged.length === 0 ? <div className="text-center py-16 text-text-muted text-sm flex flex-col items-center gap-2"><ClockCounterClockwise size={28} />No notifications</div>
            : <div className="space-y-1.5">{merged.slice(0, 50).map((it, idx) => it.kind === "chapter" ? <ChapterRow key={`c-${idx}-${(it.data as DispatchHistoryItem).sentAt}`} item={it.data as DispatchHistoryItem} /> : <LogRow key={`l-${idx}-${(it.data as ErrorLog).id}`} log={it.data as ErrorLog} />)}</div>}
        </>
      )}
    </PageShell>
  );
}
