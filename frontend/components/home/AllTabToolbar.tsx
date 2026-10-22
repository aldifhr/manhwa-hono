"use client";
import { MagnifyingGlass, ArrowsInSimple, ArrowsOutSimple } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/uiStore";

interface Props {
  localSearch: string;
  setLocalSearch: (v: string) => void;
  sortMode: "newest" | "title";
  setSortMode: (v: "newest" | "title") => void;
  groupMode: boolean;
  toggleGroupMode: () => void;
}

export default function AllTabToolbar({
  localSearch,
  setLocalSearch,
  sortMode,
  setSortMode,
  groupMode,
  toggleGroupMode,
}: Props) {
  const density = useUiStore((s) => s.density);
  const toggleDensity = useUiStore((s) => s.toggleDensity);
  const isCompact = density === "compact";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-37.5">
        <MagnifyingGlass
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"
        />
        <input
          id="home-search-input"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search title…"
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/50 focus:outline-none focus:border-white/30"
        />
      </div>
      <select
        value={sortMode}
        onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
        className="text-sm rounded-lg border border-white/10 bg-white/5 text-white px-3 py-2.5 focus:outline-none focus:border-white/30"
        title="Sort"
      >
        <option value="newest">Newest</option>
        <option value="title">Title A-Z</option>
      </select>
      <button
        onClick={toggleGroupMode}
        title="Group chapters by series"
        aria-pressed={groupMode}
        className={cn(
          "text-sm font-medium rounded-lg px-3 py-2.5 border transition-colors",
          groupMode
            ? "bg-white/10 text-white border-white/20"
            : "border-white/10 text-white/50 hover:text-white"
        )}
      >
        ⛓ Group
      </button>
      <button
        onClick={toggleDensity}
        title={isCompact ? "Comfortable view" : "Compact view"}
        className="inline-flex items-center gap-1 text-sm rounded-lg px-3 py-2.5 border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
      >
        {isCompact ? <ArrowsOutSimple size={14} /> : <ArrowsInSimple size={14} />} {isCompact ? "Comfy" : "Compact"}
      </button>
    </div>
  );
}
