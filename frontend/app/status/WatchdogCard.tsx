"use client";

import { useQuery } from "@tanstack/react-query";
import { readerFetch } from "@/lib/reader/transport";

type StalledChapter = {
  source: string;
  title_key: string;
  chapter: string;
  age_h: number;
};

type WatchdogData = {
  ok: boolean;
  status: "healthy" | "warning" | "critical" | "error";
  window_hours: number;
  stalled: number;
  urgent: number;
  aged_out: number;
  oldest_stalled_h: number;
  queue: number;
  processing: number;
  claims: number;
  chapters: StalledChapter[];
  error?: string;
};

const TONE: Record<string, { dot: string; text: string; label: string }> = {
  healthy: { dot: "bg-emerald-400", text: "text-emerald-400", label: "healthy" },
  warning: { dot: "bg-amber-400", text: "text-amber-400", label: "lagging" },
  critical: { dot: "bg-orange-500", text: "text-orange-400", label: "critical" },
  error: { dot: "bg-red-400", text: "text-red-400", label: "error" },
};

const TILE =
  "bg-surface border border-border rounded-xl p-3 flex flex-col gap-1";

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className={TILE}>
      <span className="text-[11px] uppercase tracking-wide text-white/40">{label}</span>
      <span className={`text-lg font-semibold ${tone ?? "text-white"}`}>{value}</span>
    </div>
  );
}

export function WatchdogCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["watchdog"],
    queryFn: async () => {
      const res = await readerFetch<any>("/api/v1/watchdog");
      return (res?.data ?? res) as WatchdogData;
    },
    refetchInterval: 30000,
    // Keep the last good reading on screen instead of collapsing the card
    // to a skeleton on every 30s poll.
    placeholderData: (prev: WatchdogData | undefined) => prev,
  });

  if (isLoading && !data) {
    return <div className="skeleton h-40 rounded-xl" />;
  }
  if (!data) return null;

  const tone = TONE[data.status] ?? TONE.error;
  const chapters = data.chapters ?? [];

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          <span className="font-semibold text-white">Dispatch watchdog</span>
        </div>
        <span className={`text-xs font-medium ${tone.text}`}>{tone.label}</span>
      </div>

      {!data.ok ? (
        <p className="text-sm text-red-300 break-words">
          {data.error ?? "watchdog check failed"}
        </p>
      ) : (
        <>
          <p className="text-xs text-white/50">
            Whitelisted chapters inside the {data.window_hours}h window that never
            reached Discord. Ages beyond the window are out of scope by design
            and are only counted, not alerted.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat
              label="Stalled"
              value={data.stalled}
              tone={data.stalled > 0 ? tone.text : undefined}
            />
            <Stat
              label="Over 12h"
              value={data.urgent}
              tone={data.urgent > 0 ? "text-orange-400" : undefined}
            />
            <Stat label="Oldest" value={`${data.oldest_stalled_h}h`} />
            <Stat label="Aged out" value={data.aged_out} tone="text-white/60" />
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs text-white/60">
            <div>queue <span className="text-white">{data.queue}</span></div>
            <div>processing <span className="text-white">{data.processing}</span></div>
            <div>claims <span className="text-white">{data.claims}</span></div>
          </div>

          {chapters.length > 0 && (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {chapters.map((c) => (
                <div
                  key={`${c.source}-${c.title_key}-${c.chapter}`}
                  className="flex items-center justify-between gap-2 text-xs bg-white/5 rounded px-2 py-1.5"
                >
                  <span className="truncate text-white/80" title={c.title_key}>
                    <span className="text-white/40">{c.source}</span> {c.title_key}
                  </span>
                  <span className="shrink-0 text-white/50">
                    ch {c.chapter} · {c.age_h.toFixed(1)}h
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
