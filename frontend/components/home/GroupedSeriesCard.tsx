"use client";

import { useState, memo } from "react";
import { safeUrl, getChapterLabel } from "@/lib/utils";
import { decodeHtml } from "@/lib/utils";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { useLongPress } from "@/lib/hooks/useLongPress";
import { useContinueReading } from "@/lib/continueReading";
import { useReadItems } from "./useReadItems";
import { SeriesShell, Synopsis, CardActions, RatingRow } from "./seriesShared";
import { timeAgo } from "@/lib/timeAgo";
import { sourceChapterChipClass } from "@/lib/styles";
import { OriginFlag } from "@/components/ui/OriginFlag";

interface GroupedSeries {
  title: string;
  titleKey: string;
  chapters: {
    key: string;
    source: string;
    chapter: string;
    chapterLabel: string;
    chapterNumber: number;
    url: string;
    chapterUrl: string;
    sentAt: string;
  }[];
  cover: string;
  origin: string;
  seriesUrl: string;
  rating?: string | number | null;
  genres?: string[];
  description?: string | null;
  isWhitelisted: boolean;
  type?: string | null;
  sources?: string[];
  whitelistedSources?: string[];
}

function GroupedSeriesCard({
  series,
  isRead,
  isWhitelisted,
  adding,
  onToggleRead,
  onAdd,
  onAddSource,
  isExcluded,
  excluding,
  onExclude,
  isPinned,
  onTogglePin,
  isDeepMatch,
  isNew = false,
}: {
  series: GroupedSeries;
  isRead: boolean;
  isWhitelisted: boolean;
  adding: boolean;
  onToggleRead: () => void;
  onAdd: () => void;
  onAddSource?: (source: string) => void;
  isExcluded: boolean;
  excluding: boolean;
  onExclude: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  isDeepMatch?: boolean;
  readCount?: number;
  totalChapters?: number;
  isNew?: boolean;
  unreadCount?: number;
  onMarkRead?: () => void;
  isSentToDiscord?: boolean;
}) {
  const prefetch = () => {};
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { onTouchStart, onTouchEnd, onTouchMove } = useLongPress((pos) => setMenu(pos));
  const seriesHref = safeUrl(series.seriesUrl) || "#";
  const { trackChapter } = useContinueReading();
  const { readItems } = useReadItems();
  // `country` is NULL on every row; OriginFlag falls back to `format`
  // (manhwa / manhua / manga) and owns the country mapping.
  const flagType = ((series as unknown as { format?: string | null }).format ?? series.type ?? "")
    .toString()
    .toLowerCase()
    .trim();

  const first = series.chapters[0];
  return (
    <div onMouseEnter={prefetch} onFocusCapture={prefetch}>
      <SeriesShell
        cover={series.cover}
        title={series.title}
        titleKey={series.titleKey}
        seriesUrl={seriesHref}
        isRead={isRead}
        overlaySource={first?.source ?? null}
        overlayLabel={null}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        className={isDeepMatch ? "ring-2 ring-white ring-offset-2 ring-offset-black" : undefined}
      >
        {/* Title + flag — same as HomeGroupedCard */}
        <div className="flex min-w-0 items-start gap-2">
          <OriginFlag origin={series.origin} type={flagType} className="mt-0.5 h-4 w-4 shrink-0" />
          <a href={seriesHref} target="_blank" rel="noopener noreferrer" className="block min-h-0 min-w-0 flex-1 rounded focus-visible:ring-2 focus-visible:ring-white">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight text-white transition-colors group-hover:text-white/80 sm:text-base">
              {decodeHtml(series.title)}
            </h3>
          </a>
        </div>

        {isNew && (
          <span className="inline-flex shrink-0 items-center rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Baru
          </span>
        )}
        <RatingRow rating={series.rating} genres={series.genres} />
        {(series.chapters[0]?.sentAt || (series as any).latestUpdated || (series.chapters[0] as any)?.createdAt) && (
          <span suppressHydrationWarning className="text-[11px] text-white/50">{timeAgo(series.chapters[0].sentAt || (series as any).latestUpdated || (series.chapters[0] as any)?.createdAt)}</span>
        )}

        <Synopsis text={series.description} />

        {/* Pills — same as HomeGroupedCard: slice 0-4, rounded-md, Ch. only */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
          {series.chapters.slice(0, 4).map((ch) => {
            const label = getChapterLabel(ch as any);
            if (label === "?") return null;
            const href = ch.chapterUrl || ch.url || series.seriesUrl || "#";
            const src = ch.source?.toLowerCase();
            const chipColor = sourceChapterChipClass(src);
            return (
              <a
                key={ch.key}
                href={safeUrl(href) || "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackChapter({
                    title: series.title,
                    titleKey: series.titleKey,
                    cover: series.cover,
                    source: ch.source,
                    chapter: ch.chapter,
                    chapterLabel: ch.chapterLabel,
                    chapterNumber: ch.chapterNumber,
                    chapterUrl: href !== "#" ? href : ch.chapterUrl || ch.url,
                    seriesUrl: series.seriesUrl,
                    origin: series.origin,
                  })
                }
                className={`inline-flex min-h-0 min-w-0 items-center justify-center rounded-md border px-2 py-1 text-[11px] leading-none transition-colors ${chipColor}`}
              >
                Ch. {label}
              </a>
            );
          })}
          {series.chapters.every((c) => getChapterLabel(c as any) === "?") && (
            <a
              href={seriesHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-0 min-w-0 items-center justify-center rounded-md border border-white/8 bg-white/10 px-2 py-1 text-[11px] leading-none text-white/80 transition-colors hover:bg-white/20"
            >
              View Series
            </a>
          )}
        </div>

        <CardActions
          isWhitelisted={isWhitelisted}
          sources={series.sources}
          whitelistedSources={series.whitelistedSources}
          onAddSource={onAddSource}
          isExcluded={isExcluded}
          excluding={excluding}
          onExclude={onExclude}
          adding={adding}
          onAdd={onAdd}
          isRead={isRead}
          onToggleRead={onToggleRead}
          showRead={false}
          showAdd={true}
        />
      </SeriesShell>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: isRead ? "Mark as unread" : "Mark as read", onClick: onToggleRead },
            { label: isPinned ? "Unpin" : "Pin to top", onClick: () => onTogglePin?.() },
          ]}
        />
      )}
    </div>
  );
}

export default memo(GroupedSeriesCard);
