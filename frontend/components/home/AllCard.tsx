"use client";

import React, { useState } from "react";
import { safeUrl, getChapterLabel } from "@/lib/utils";
import { decodeHtml } from "@/lib/utils";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { useLongPress } from "@/lib/hooks/useLongPress";
import { useContinueReading } from "@/lib/continueReading";
import { SeriesShell, Synopsis, CardActions, RatingRow } from "./seriesShared";
import { timeAgo } from "@/lib/timeAgo";
import { sourceChapterChipClass } from "@/lib/styles";
import { OriginFlag } from "@/components/ui/OriginFlag";

interface AllCardItem {
  title: string;
  titleKey: string;
  chapter: string;
  chapterLabel: string;
  chapterNumber: number;
  url: string;
  chapterUrl: string;
  source: string;
  cover: string;
  origin: string;
  type?: string | null;
  seriesUrl: string;
  rating?: string | number | null;
  genres?: string[];
  createdAt: string;
  sentAt: string;
  description?: string | null;
}

function AllCard({
  item,
  isRead,
  isWhitelisted,
  adding,
  onToggleRead,
  onAdd,
  isExcluded,
  excluding,
  onExclude,
  isPinned = false,
  onTogglePin,
  showReadButton = true,
  showAddButton = true,
  isNew = false,
  isSentToDiscord = false,
}: {
  item: AllCardItem;
  isRead: boolean;
  isWhitelisted: boolean;
  adding: boolean;
  onToggleRead: () => void;
  onAdd: () => void;
  isExcluded: boolean;
  excluding: boolean;
  onExclude: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  showReadButton?: boolean;
  showAddButton?: boolean;
  isNew?: boolean;
  isSentToDiscord?: boolean;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const seriesHref = safeUrl(item.seriesUrl || item.url) || "#";
  const chapterHref = safeUrl(item.chapterUrl || item.url) || "#";
  const { onTouchStart, onTouchEnd, onTouchMove, wasLongPressed } = useLongPress((pos) => setMenu(pos));
  const prefetch = () => {};
  const { trackChapter } = useContinueReading();
  // `country` is NULL on every row; OriginFlag falls back to `format`
  // (manhwa / manhua / manga) and owns the country mapping.
  const t = ((item as unknown as { format?: string | null }).format ?? item.type ?? "")
    .toString()
    .toLowerCase()
    .trim();
  const lbl = getChapterLabel(item);
  const doTrack = () => {
    trackChapter({
      title: item.title,
      titleKey: item.titleKey,
      cover: item.cover,
      source: item.source,
      chapter: item.chapter,
      chapterLabel: item.chapterLabel,
      chapterNumber: item.chapterNumber,
      chapterUrl: chapterHref !== "#" ? chapterHref : item.chapterUrl || item.url,
      seriesUrl: item.seriesUrl,
      origin: item.origin,
    });
  };
  const openChapter = (e?: React.SyntheticEvent) => {
    if (wasLongPressed()) { e?.preventDefault(); return; }
    if (chapterHref !== "#") { doTrack(); window.open(chapterHref, "_blank", "noopener,noreferrer"); }
  };
  const src = item.source?.toLowerCase();
  const chipColor = sourceChapterChipClass(src);

  return (
    <div onMouseEnter={prefetch} onFocusCapture={prefetch}>
      <SeriesShell
        cover={item.cover}
        title={item.title}
        titleKey={item.titleKey}
        seriesUrl={seriesHref}
        isRead={isRead}
        overlaySource={item.source}
        overlayLabel={null}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        onClick={openChapter}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (chapterHref !== "#") { doTrack(); window.open(chapterHref, "_blank", "noopener,noreferrer"); }
          }
        }}
        role={chapterHref !== "#" ? "link" : undefined}
        tabIndex={chapterHref !== "#" ? 0 : undefined}
        ariaLabel={chapterHref !== "#" ? `Open chapter ${lbl} of ${item.title}` : undefined}
        titleAttr="Click to open chapter"
      >
        <div className="flex min-w-0 items-start gap-2">
          <OriginFlag origin={item.origin} type={t} className="mt-0.5 h-4 w-4 shrink-0" />
          <a href={seriesHref} target="_blank" rel="noopener noreferrer" className="block min-h-0 min-w-0 flex-1 rounded focus-visible:ring-2 focus-visible:ring-white">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight text-white transition-colors group-hover:text-white/80 sm:text-base">
              {decodeHtml(item.title)}
            </h3>
          </a>
        </div>

        {isNew && (
          <span className="inline-flex shrink-0 items-center rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Baru
          </span>
        )}
        <RatingRow rating={item.rating} genres={item.genres} />
        {(item.sentAt || item.createdAt) && (
          <span suppressHydrationWarning className="text-[11px] text-white/50">{timeAgo(item.sentAt || item.createdAt)}</span>
        )}

        <Synopsis text={item.description} />

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
          {lbl !== "?" ? (
            <a
              href={chapterHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={doTrack}
              className={`inline-flex min-h-0 min-w-0 items-center justify-center rounded-md border px-2 py-1 text-[11px] leading-none transition-colors ${chipColor}`}
            >
              Ch. {lbl}
            </a>
          ) : (
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
          isExcluded={isExcluded}
          excluding={excluding}
          onExclude={onExclude}
          adding={adding}
          onAdd={onAdd}
          isRead={isRead}
          onToggleRead={onToggleRead}
          showRead={showReadButton}
          showAdd={showAddButton}
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

export default React.memo(AllCard);
