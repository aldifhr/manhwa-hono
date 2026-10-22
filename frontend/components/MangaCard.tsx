"use client";
import React, { useMemo, useState } from "react";
import { Star } from "@phosphor-icons/react";
import { OriginFlag } from "@/components/ui/OriginFlag";
import { decodeHtml, rewriteCoverUrl, safeUrl } from "@/lib/utils";
import { timeAgo } from "@/lib/timeAgo";
import { sourceOverlayClass } from "@/lib/styles";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSourcesHealth, isHealthy } from "@/hooks/useSourcesHealth";


interface Props {
  title: string;
  cover: string | null;
  id: string;
  rating?: string | number | null;
  origin?: string | null;
  source?: string | null;
  sources?: (string | { source: string; url?: string })[] | null;
  description?: string | null;
  genres?: string[] | null;
  lastNotified?: string | null;
  detailUrl?: string | null;
  titleKey?: string | null;
}

function MangaCard({
  title,
  cover,
  id,
  rating,
  origin,
  source,
  sources,
  description,
  genres,
  lastNotified,
  detailUrl,
  titleKey,
  type,
}: Props & { type?: string | null }) {
  const decodedTitle = useMemo(() => decodeHtml(title), [title]);
  const decodedDesc = useMemo(
    () => (description ? decodeHtml(description) : ""),
    [description]
  );
  const [imgErr, setImgErr] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const ratingNum = rating != null && rating !== "" ? Number(rating) : null;
  const hasRating = ratingNum !== null && !isNaN(ratingNum) && ratingNum > 0;

  // All sources this title is tracked under (deduped card merges sources)
  // BE whitelist route historically returned sources as {source,url}[] or string[] or mixed (prod).
  // When local FE points at prod BE (BACKEND_URL=https://scanner.aldifhr.my.id) the shape can change without rebuild.
  // Harden: only string sources survive to .join(), never "[object Object]".
  const normalizeSource = (s: unknown): string | null => {
    if (typeof s === "string" && s.trim()) return s.trim();
    if (s && typeof s === "object") {
      const v = (s as Record<string, unknown>).source;
      if (typeof v === "string" && v.trim()) return v.trim();
      // fallback: some BE variants nest as {source: { name: "..."}} or plain object
      if (
        typeof v === "object" &&
        v !== null &&
        typeof (v as Record<string, unknown>).name === "string"
      ) {
        return String((v as Record<string, unknown>).name).trim();
      }
    }
    return null;
  };
  const allSources = Array.from(
    new Set([
      ...(sources || [])
        .map(normalizeSource)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
      ...(typeof source === "string" && source.trim() ? [source.trim()] : []),
    ])
  );

  const health = useSourcesHealth();
  const prefetchDetail = () => {};
  const showCover = cover && !imgErr;
  const proxiedCover = showCover ? rewriteCoverUrl(cover) : null;

  return (
    <Card className="group relative overflow-hidden bg-surface border border-border transition-all duration-300 hover:-translate-y-1 hover:border-accent/25 hover:shadow-[0_8px_32px_-6px_rgba(129,140,248,0.18)] flex flex-col h-full p-0 gap-0">
      {/* Ambient underglow */}
      <div className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(ellipse_at_center,rgba(129,140,248,0.06),transparent_70%)]" />

      {/* External series URL (preferred) or internal whitelist anchor */}
      <a
        href={
          safeUrl(detailUrl) ||
          (titleKey ? `/whitelist?focus=${encodeURIComponent(titleKey)}` : "#")
        }
        target={detailUrl ? "_blank" : undefined}
        rel={detailUrl ? "noopener noreferrer" : undefined}
        onClick={(e) => {
          if (!detailUrl && !titleKey) e.preventDefault();
        }}
        onMouseEnter={prefetchDetail}
        onFocus={prefetchDetail}
        className="relative flex flex-col h-full"
      >
        {/* Cover */}
        <div className="aspect-3/4 relative overflow-hidden bg-surface-hover">
          {showCover ? (
            <>
              {/* Blurhash shimmer placeholder */}
              <div
                className="absolute inset-0 transition-opacity duration-500"
                style={{
                  opacity: imgLoaded ? 0 : 1,
                  background: `linear-gradient(135deg, #27272a 0%, #3f3f46 50%, #27272a 100%)`,
                  filter: imgLoaded ? "blur(0px)" : "blur(12px)",
                }}
                aria-hidden
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent animate-pulse" />
              </div>
              <img
                src={proxiedCover || cover}
                alt={decodedTitle}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                style={{
                  opacity: imgLoaded ? 1 : 0,
                  transitionProperty: "opacity, transform",
                }}
                onError={() => setImgErr(true)}
                onLoad={() => setImgLoaded(true)}
              />
              {/* Cinematic vignette */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_top,rgba(0,0,0,0.65)_0%,rgba(0,0,0,0.15)_30%,transparent_55%)]" />
              <div className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.35)_100%)]" />
            </>
          ) : (
            /* Fallback placeholder */
            <div className="w-full h-full flex items-center justify-center bg-[linear-gradient(145deg,var(--color-surface-hover),var(--color-surface),var(--color-surface-hover))]">
              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl font-bold text-accent/15 select-none transition-colors duration-300 group-hover:text-accent/25 leading-none">
                  {decodedTitle.charAt(0).toUpperCase()}
                </span>
                <span className="w-6 h-px bg-border-subtle rounded-full" />
              </div>
            </div>
          )}

          {/* Top-left cluster: origin flag. `country` is NULL on every row, so
              the always-populated `type` (manhwa/manhua/manga) is the fallback. */}
          <div className="absolute top-2 left-2 z-10">
            <span className="block overflow-hidden rounded-[3px] shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
              <OriginFlag origin={origin} type={type} className="block h-auto w-5" />
            </span>
          </div>
          {/* Source badge(s) — top-right with health dot */}
          {allSources.length > 0 && (
            <div className="absolute top-2 right-2 inline-flex items-center gap-1 z-10">
              {allSources.map((src) => {
                const s = src.toLowerCase();
                const down = !isHealthy(health[s]);
                const color = sourceOverlayClass(s);
                return (
                  <span
                    key={src}
                    title={down ? `${src} • down` : `${src} • healthy`}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold rounded shadow-[0_2px_6px_rgba(0,0,0,0.4)] backdrop-blur-md border border-white/10 uppercase tracking-wide ${down ? "ring-1 ring-red-400/60" : ""} ${color}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${down ? "bg-red-300 animate-pulse" : "bg-emerald-300"}`} />
                    {src}
                  </span>
                );
              })}
            </div>
          )}

          {/* Title + Rating — bottom-left overlay */}
          <div className="absolute bottom-0 left-0 right-0 z-10 p-2 bg-linear-to-t from-black/80 via-black/40 to-transparent">
            {hasRating && (
              <div className="inline-flex items-center gap-1 mb-1">
                <Star weight="fill" size={11} className="text-amber-400" />
                <span className="text-[11px] font-semibold leading-none text-amber-400">
                  {ratingNum!.toFixed(1)}
                </span>
              </div>
            )}
            <h3 className="text-[13px] font-medium leading-[1.3] truncate text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              {decodedTitle}
            </h3>
          </div>
          {/* Hover darken overlay */}
          <div className="absolute inset-0 pointer-events-none bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />
          {/* Bottom accent line — reveals on hover */}
          <div className="absolute bottom-0 inset-x-0 h-0.5 bg-linear-to-r from-transparent via-accent/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>

        {/* Metadata */}
        <div className="px-2.5 pt-2.5 pb-2.5 space-y-1 flex-1 flex flex-col">
          <p className="text-[10px] leading-[1.35] text-text-muted line-clamp-2">
            {decodedDesc}
          </p>
          <div className="flex flex-wrap gap-1">
            {genres && genres.length > 0
              ? Array.from(new Set(genres.map((g) => g.trim()).filter(Boolean)))
                  .slice(0, 3)
                  .map((g, i) => (
                    <Badge
                      key={`${g}-${i}`}
                      variant="secondary"
                      className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-surface-hover text-text-muted line-clamp-1 max-w-20 border-0"
                    >
                      {g}
                    </Badge>
                  ))
              : null}
          </div>
          <div className="mt-auto space-y-1 pt-0.5">
            {lastNotified && (
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full shrink-0 bg-accent/60" />
                <span className="text-[10px] text-text-muted leading-none">
                  Notified {timeAgo(lastNotified)}
                </span>
              </div>
            )}
          </div>
        </div>
      </a>

      {/* Left edge accent — hover reveal */}
      <div className="absolute top-8 bottom-8 left-0 w-0.5 rounded-full bg-accent/50 opacity-0 -translate-x-px transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
    </Card>
  );
}

function MangaCardSkeleton() {
  return (
    <Card className="overflow-hidden bg-surface border border-border flex flex-col p-0">
      <Skeleton className="aspect-3/4 w-full" />
      <CardContent className="px-2.5 pt-2.5 pb-2.5 space-y-2 flex-1">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex items-center gap-1.5 pt-1">
          <Skeleton className="size-1.5 rounded-full shrink-0" />
          <Skeleton className="h-3 w-10" />
        </div>
      </CardContent>
    </Card>
  );
}
(MangaCard as unknown as { Skeleton: typeof MangaCardSkeleton }).Skeleton =
  MangaCardSkeleton;
export { MangaCardSkeleton };

export default React.memo(MangaCard);
