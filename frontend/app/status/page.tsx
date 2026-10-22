"use client";

import { PageShell } from "@/components/PageShell";
import { useQuery } from "@tanstack/react-query";
import { readerFetch } from "@/lib/reader/transport";
import { ALL_SOURCES } from "@/lib/constants";
import { WatchdogCard } from "./WatchdogCard";

const badge = (s: string) => {
  const v = s?.toLowerCase();
  if (v === "disabled") return "text-gray-400 bg-gray-500/10 border-gray-500/20";
  if (v === "healthy") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (v === "degraded" || v === "rate_limited") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-red-400 bg-red-500/10 border-red-500/20";
};

function formatNext(sec: number | null | undefined): string {
  if (sec == null) return "—";
  if (sec <= 0) return "now";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

export default function StatusPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sources-health"],
    queryFn: async () => {
      try {
        const res: any = await readerFetch<any>("/api/v1/sources/health");
        return res?.data ?? res ?? [];
      } catch {
        return [];
      }
    },
    refetchInterval: 15000,
  });
  const { data: cron } = useQuery({
    queryKey: ["cron-status"],
    queryFn: async () => {
      try {
        const res: any = await readerFetch<any>("/api/v1/cron/status");
        return res?.data ?? res ?? {};
      } catch {
        return {};
      }
    },
    refetchInterval: 15000,
  });
  const sources: any[] = (data as any)?.sources ?? (Array.isArray((data as any)?.data) ? (data as any).data : data as any) ?? [];
  const cronSources: any = (cron as any)?.per_source ?? {};
  const queueDepth = (cron as any)?.queue_depth ?? (cron as any)?.queueDepth ?? 0;
  const isProcessing = (cron as any)?.is_processing ?? (cron as any)?.isProcessing ?? false;
  // merge health + cron per_source for disabled/nextScrape
  const list = (() => {
    const base = sources.length ? sources : (cron as any)?.sources ?? [];
    // ensure sources always shown
    const want = [...ALL_SOURCES];
    const map = new Map<string, any>();
    for (const s of base) {
      const key = (s.name || s.source || "").toLowerCase();
      if (key) map.set(key, s);
    }
    // fill missing from SOURCE_KEYS
    for (const k of want) if (!map.has(k)) map.set(k, { source: k, name: k, status: "unknown" });
    return Array.from(map.values()).map((s: any) => {
      const key = (s.source || s.name || "").toLowerCase();
      const per = cronSources[key] || {};
      // disabled if DISABLED_SOURCES contains or disabledUntil future or status disabled
      let disabled = false;
      try {
        const envDisabled = (process.env.NEXT_PUBLIC_DISABLED_SOURCES || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
        if (envDisabled.includes(key)) disabled = true;
      } catch {}
      if (s.disabledUntil && new Date(s.disabledUntil) > new Date()) disabled = true;
      if (String(s.status || "").toLowerCase() === "disabled") disabled = true;
      const status = disabled ? "disabled" : s.status || "unknown";
      return { ...s, status, _nextIn: per.next_scrape_in_s ?? per.nextScrapeIn ?? null, _lastScrape: per.last_scrape ?? per.lastScrape ?? s.lastSuccess ?? s.lastScrape ?? null };
    });
  })();

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Status</h1>
        <span className="text-xs text-white/40">
          2 sources • queue {queueDepth} {isProcessing ? "• processing" : ""} • refresh 15s
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300 text-sm">{(error as Error).message}</div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-white/50">No health data</div>
      ) : (
        <div className="space-y-3">
          <WatchdogCard />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((s: any) => (
            <div key={s.name || s.source} className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold capitalize text-white">{s.name || s.source}</span>
                <span className={`px-2 py-1 text-xs rounded-full border font-medium ${badge(s.status)}`}>{s.status || "unknown"}</span>
              </div>
              <div className="space-y-1 text-xs text-white/60">
                <div>Last scrape: <span className="text-white">{s._lastScrape ? new Date(s._lastScrape).toLocaleString() : s.lastSuccess ? new Date(s.lastSuccess).toLocaleString() : s.lastScrape ? new Date(s.lastScrape).toLocaleString() : "—"}</span></div>
                <div>Next scrape: <span className="text-white">{formatNext(s._nextIn)}</span></div>
                <div>Consecutive failures: <span className="text-white">{s.consecutiveFailures ?? 0}</span></div>
                <div>Error rate 24h: <span className="text-white">{s.errorRate24h ?? s.errorRate ?? "0"}%</span></div>
                {s.disabledUntil && <div>Disabled until: <span className="text-amber-300">{new Date(s.disabledUntil).toLocaleString()}</span></div>}
                {s.lastError && <div className="text-red-300 break-words">Error: {String(s.lastError).slice(0,120)}</div>}
                {s.responseTimeMs !== undefined && <div>Response: {s.responseTimeMs}ms</div>}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}
