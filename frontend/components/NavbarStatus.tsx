"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Reader } from "@/lib/reader";
import { queryKeys, staleTimes, gcTimes } from "@/lib/queryKeys";

type Agg = "operational" | "degraded" | "stale";

function aggregate(
  sourceHealth?: Record<string, { status: string }>,
  cronStatus?: { timestamp: string } | null
): Agg {
  const sources = Object.values(sourceHealth ?? {});
  if (sources.some((s) => {
    const st = s.status?.toLowerCase();
    return st === "degraded" || st === "down";
  })) {
    return "degraded";
  }
  if (cronStatus?.timestamp) {
    const ageMs = Date.now() - Date.parse(cronStatus.timestamp);
    if (ageMs > 24 * 3600 * 1000) return "stale";
  } else {
    return "stale";
  }
  return "operational";
}

const LABEL: Record<Agg, string> = {
  operational: "Live",
  degraded: "Degraded",
  stale: "Idle",
};

const DOT_CLASS: Record<Agg, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-400 animate-pulse",
  stale: "bg-red-500",
};

/**
 * Compact system-status indicator for the navbar header.
 * Reuses the shared dashboardSnapshot query (auto-refresh 30s), so it never
 * doubles network traffic. The status DOT uses color (green/amber/red) for
 * at-a-glance health; the rest of the UI stays black & white per theme rules.
 * Clicking it opens /status.
 */
export default function NavbarStatus({
  variant = "desktop",
}: {
  variant?: "desktop" | "mobile";
}) {
  const { data } = useQuery({
    queryKey: queryKeys.dashboardSnapshot,
    queryFn: () =>
      Reader.getDashboardSnapshot() as Promise<{
        sourceHealth?: Record<string, { status: string }>;
        cronStatus?: { timestamp: string } | null;
      } | null>,
    refetchInterval: 30_000,
    staleTime: staleTimes.dashboard,
    gcTime: gcTimes.dashboard,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // getDashboardSnapshot returns null on 401/403 (not logged in) — jangan tampil Idle
  // kalau belum login / masih loading, anggap Live biar tidak misleading merah
  const agg = !data ? "operational" : aggregate(data.sourceHealth, data.cronStatus);

  const dot = (
    <span
      className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[agg]}`}
      aria-hidden
    />
  );

  if (variant === "mobile") {
    return (
      <div className="flex items-center justify-between w-full px-4 py-3 rounded-lg text-base font-medium text-white/70">
        <span className="flex items-center gap-2">
          {dot}
          System Status
        </span>
        <span className="text-xs text-white/50">{LABEL[agg]}</span>
      </div>
    );
  }

  return (
    <span
      title="System status"
      aria-label="System status"
      className="hidden md:inline-flex h-8 w-fit shrink-0 items-center gap-2 px-3 rounded-lg border border-white/10 text-xs font-medium leading-none text-white/70"
    >
      {dot}
      <span className="leading-none">{LABEL[agg]}</span>
    </span>
  );
}
