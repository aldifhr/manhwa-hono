"use client";

import { useQuery } from "@tanstack/react-query";
import { readerFetch } from "@/lib/reader/transport";

/**
 * Group dispatch rows into the last three local days.
 *
 * The API serialises timestamps as `sentAt` in camelCase, so both spellings are
 * accepted here — reading only `sent_at` made every bucket zero even when the
 * response carried rows.
 */
function dayKey(value?: string): string {
  if (!value) return "";
  // Take the date portion off the raw string rather than re-serialising: the
  // server sends UTC, and slice(0,10) on that string is what the day buckets
  // are keyed by, so round-tripping through Date would shift it by the offset.
  return value.slice(0, 10);
}

function groupByDay(
  rows: { sentAt?: string; sent_at?: string; created_at?: string }[]
): { day: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const iso = dayKey(r.sentAt || r.sent_at || r.created_at);
    if (!iso) continue;
    map.set(iso, (map.get(iso) || 0) + 1);
  }
  const days: string[] = [];
  const now = new Date();
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days.map((day) => ({ day, count: map.get(day) || 0 }));
}

export default function DispatchChart() {
  const { data, isLoading } = useQuery({
    queryKey: ["dispatch-3d"],
    queryFn: async () => {
      // dispatch-history is the only source with per-row timestamps, which is
      // what the daily buckets need. The cron/health call used to short-circuit
      // and return a {total, sent24h} shape that has no rows at all, so the
      // chart rendered 0/0/0 forever. Keep it as a fallback for the summary
      // number only.
      try {
        const res2 = await readerFetch<{ success: boolean; data: { results: any[] } }>(
          "/api/v1/dispatch-history?limit=100&page=1&page_size=100"
        );
        const rows: any[] = (res2 as any)?.data?.results ?? (res2 as any)?.results ?? [];
        if (rows.length) return { rows, total: null as number | null, sent24h: null as number | null };
      } catch {}

      try {
        const res = await readerFetch<{ success: boolean; data: any }>("/api/v1/cron/health");
        const d = (res as any)?.data?.dispatch;
        if (d) return { rows: [] as any[], total: d.total ?? 0, sent24h: d.sent_24h ?? 0 };
      } catch {}

      return { rows: [] as any[], total: null as number | null, sent24h: null as number | null };
    },
    refetchInterval: 30000,
  });

  const rows: any[] = (data as any)?.rows ?? [];
  const grouped = groupByDay(rows);
  const max = Math.max(1, ...grouped.map((g) => g.count));
  const total3d = grouped.reduce((a, b) => a + b.count, 0);

  if (isLoading) return <div className="skeleton h-20 rounded-xl" />;

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white text-sm">Dispatch 3d</h3>
        <span className="text-xs text-white/40">retention 3d • total {total3d}</span>
      </div>
      <div className="flex items-end gap-2 h-20">
        {grouped.map((g) => {
          const h = Math.round((g.count / max) * 64);
          const label = g.day === new Date().toISOString().slice(0, 10) ? "Today" : g.day === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? "Yesterday" : "2d ago";
          return (
            <div key={g.day} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-white/70">{g.count}</span>
              <div className="w-full bg-white/10 rounded-t-md relative" style={{ height: 64 }}>
                <div className="absolute bottom-0 w-full bg-accent rounded-t-md transition-all" style={{ height: h }} />
              </div>
              <span className="text-xs text-white/40">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function groupByDayForTest(rows: any[]) {
  return groupByDay(rows);
}
