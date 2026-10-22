/**
 * Utility functions for button and filter styling
 */
import { cn } from "@/lib/utils";

export function filterButtonClass(
  active: boolean,
  variant: "pill" | "tab" = "pill"
): string {
  if (variant === "tab") {
    return cn(
      "px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer",
      active
        ? "text-white border-white"
        : "text-white/50 border-transparent hover:text-white hover:border-white/20"
    );
  }

  // pill variant (default) — gold accent when active
  return cn(
    "px-3 py-1.5 text-xs font-medium rounded-full transition-colors cursor-pointer border shrink-0 whitespace-nowrap min-h-0 min-w-0",
    active
      ? "bg-white text-black border-transparent shadow-[0_2px_10px_rgba(255,255,255,0.08)]"
      : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20 hover:bg-white/10"
  );
}

const SOURCE_COLOR: Record<string, string> = {
  shinigami: "red",
  voratoon: "orange",
  ikiru: "green",
};
const SOURCE_MAP: Record<string, { badge: string; chip: string }> = {
  shinigami: {
    badge: "bg-red-500/15 text-red-400 border border-red-500/20",
    chip: "bg-red-500/15 text-red-400",
  },
  voratoon: {
    badge: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
    chip: "bg-orange-500/15 text-orange-400",
  },
  ikiru: {
    badge: "bg-green-500/15 text-green-400 border border-green-500/20",
    chip: "bg-green-500/15 text-green-400",
  },
};
export function sourceBadgeClass(source: string | null | undefined): string {
  return (
    SOURCE_MAP[String(source ?? "").toLowerCase()]?.badge ??
    "bg-white/10 text-white/80 border border-white/10"
  );
}
export function sourceChipClass(source: string | null | undefined): string {
  return SOURCE_MAP[String(source ?? "").toLowerCase()]?.chip ?? "bg-white/10 text-white/80";
}

// Solid variant for badges rendered over cover art, where a translucent tint
// would wash out. Kept next to SOURCE_MAP so a new source picks up both.
const SOURCE_OVERLAY_MAP: Record<string, string> = {
  shinigami: "bg-red-500 text-white",
  voratoon: "bg-orange-500 text-white",
  ikiru: "bg-green-500 text-white",
};

export function sourceOverlayClass(source: string | null | undefined): string {
  return SOURCE_OVERLAY_MAP[String(source ?? "").toLowerCase()] ?? "bg-white/80 text-black";
}

// Interactive variant for the per-chapter chips in the reader strip, which
// need hover and border states the static chip does not carry.
const SOURCE_CHAPTER_CHIP_MAP: Record<string, string> = {
  shinigami:
    "bg-red-500/15 text-red-400 hover:bg-red-500/25 border-red-500/20",
  voratoon:
    "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border-orange-500/20",
};

export function sourceChapterChipClass(source: string | null | undefined): string {
  return (
    SOURCE_CHAPTER_CHIP_MAP[String(source ?? "").toLowerCase()] ??
    "bg-white/10 text-white/80 hover:bg-white/20 border-white/8"
  );
}

// Canonical status / severity colors (single source of truth).
// Use these instead of hardcoding hex in components.
export const STATUS_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  down: "#ef4444",
};
