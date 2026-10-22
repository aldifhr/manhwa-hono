"use client";
import { cn } from "@/lib/utils";

interface Props {
  distinctTotal: number;
  wlCount: number;
  nowlCount: number;
  groupedCount: number;
  countLabel?: string;
  feed: "all" | "nowl" | "wl";
  setFeed: (f: "all" | "nowl" | "wl") => void;
  hasData: boolean;
}

export default function AllTabHeader({
  distinctTotal,
  wlCount,
  nowlCount,
  groupedCount,
  countLabel = "series",
  feed,
  setFeed,
  hasData,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-baseline gap-2.5 sm:gap-3.5 flex-wrap">
        <h1
          className="text-[20px] sm:text-[22px] font-bold tracking-[-0.03em] text-white"
          style={{ fontFamily: '"Space Grotesk", var(--font-sans)' }}
        >
          All Manhwa
        </h1>
        <div className="flex items-center rounded-full border border-white/10 overflow-hidden text-xs p-0.5 bg-white/[0.03]">
          <button
            onClick={() => setFeed("all")}
            className={cn(
              "px-2 sm:px-3 py-1.5 transition-colors whitespace-nowrap",
              feed === "all"
                ? "bg-white/10 text-white"
                : "text-white/50 hover:text-white"
            )}
          >
            Semua
            {hasData && (
              <span className="opacity-60 ml-0.5 hidden sm:inline tabular-nums">
                ({distinctTotal})
              </span>
            )}
          </button>
          <button
            onClick={() => setFeed("nowl")}
            className={cn(
              "px-2 sm:px-3 py-1.5 transition-colors whitespace-nowrap",
              feed === "nowl"
                ? "bg-white/10 text-white"
                : "text-white/50 hover:text-white"
            )}
          >
            Non-WL
            {hasData && (
              <span className="opacity-60 ml-0.5 hidden sm:inline tabular-nums">
                ({nowlCount})
              </span>
            )}
          </button>
          <button
            onClick={() => setFeed("wl")}
            className={cn(
              "px-2 sm:px-3 py-1.5 transition-colors whitespace-nowrap",
              feed === "wl"
                ? "bg-white/10 text-white"
                : "text-white/50 hover:text-white"
            )}
          >
            WL
            {hasData && (
              <span className="opacity-60 ml-0.5 hidden sm:inline tabular-nums">
                ({wlCount})
              </span>
            )}
          </button>
        </div>
        {hasData && (
          <span className="text-[11px] font-medium tracking-wide px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/50">
            {groupedCount} {countLabel}
          </span>
        )}
      </div>
    </div>
  );
}
