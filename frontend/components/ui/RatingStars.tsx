"use client";
import { Star } from "@phosphor-icons/react";

export function RatingStars({
  rating,
  size = 14,
  showValue = true,
}: {
  rating?: string | number | null;
  size?: number;
  showValue?: boolean;
}) {
  const r = parseFloat(String(rating ?? ""));
  if (!r || isNaN(r)) return null;
  const pct = Math.max(0, Math.min(100, (r / 10) * 100));
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/80">
      <span
        className="relative inline-block"
        style={{ width: size, height: size }}
      >
        <Star
          size={size}
          weight="fill"
          className="absolute inset-0 text-white/20"
        />
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${pct}%` }}
        >
          <Star size={size} weight="fill" className="text-white" />
        </span>
      </span>
      {showValue && r.toFixed(2)}
    </span>
  );
}

// manga card variant (amber)
export function RatingBadge({ rating }: { rating?: string | number | null }) {
  const n = rating != null && rating !== "" ? Number(rating) : null;
  if (n === null || isNaN(n) || n <= 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 pl-1 pr-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-black/60 text-amber-400 backdrop-blur-md border border-amber-400/10 shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
      <Star weight="fill" size={10} className="text-amber-400" />
      {n.toFixed(1)}
    </span>
  );
}
