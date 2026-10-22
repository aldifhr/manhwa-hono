"use client";
import { normalizeOrigin, getOriginFlag } from "@/lib/constants";

export function OriginFlag({
  origin,
  type,
  className = "w-4 h-3 rounded-sm object-cover",
}: {
  origin?: string | null;
  type?: string | null;
  className?: string;
}) {
  // `country` is NULL on every row, so `type` (manhwa / manhua / manga) is the
  // only populated signal. normalizeOrigin maps all three to KR / CN / JP.
  const t = (type || "").toLowerCase().trim();
  if (!t) return null;
  // Prefer the real country when present, otherwise derive it from the format.
  const normalized = normalizeOrigin(origin || t);
  const flag = getOriginFlag(normalized);
  if (!flag) return null;
  return <img src={flag} alt={normalized} title={normalized} className={className} />;
}
