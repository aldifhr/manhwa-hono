"use client";
import { useState } from "react";
import { cn, safeUrl } from "@/lib/utils";
import { decodeHtml } from "@/lib/utils";
import { Check, Eye, EyeSlash, CheckCircle, Plus } from "@phosphor-icons/react";
import { Cover } from "@/components/ui/Cover";
import { RatingStars } from "@/components/ui/RatingStars";
import { OriginFlag } from "@/components/ui/OriginFlag";
import { SourceChip } from "@/components/ui/SourceChip";
import { GenreChips } from "@/components/ui/GenreChips";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getChapterLabel } from "@/lib/utils";
import { sourceBadgeClass, sourceChapterChipClass, sourceOverlayClass } from "@/lib/styles";

// ── Shell — single seam for all series cards ──
export function SeriesShell({
  cover,
  title,
  titleKey,
  seriesUrl,
  isRead,
  children,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  ariaLabel,
  titleAttr,
  className,
  overlaySource,
  overlayLabel,
}: {
  cover: string;
  title: string;
  titleKey?: string;
  seriesUrl: string;
  isRead?: boolean;
  children: React.ReactNode;
  onTouchStart?: React.TouchEventHandler;
  onTouchEnd?: React.TouchEventHandler;
  onTouchMove?: React.TouchEventHandler;
  onClick?: React.MouseEventHandler;
  onKeyDown?: React.KeyboardEventHandler;
  role?: string;
  tabIndex?: number;
  ariaLabel?: string;
  titleAttr?: string;
  className?: string;
  overlaySource?: string | null;
  overlayLabel?: string | null;
}) {
  const href = safeUrl(seriesUrl) || "#";
  const s = (overlaySource || "").toLowerCase();
  const pillCls = sourceOverlayClass(s);
  return (
    <Card
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      title={titleAttr}
      className={cn(
        "group relative rounded-2xl border border-white/10 bg-[#111111] transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#161616] hover:shadow-[0_18px_36px_-24px_rgba(0,0,0,0.95)]",
        isRead && "opacity-50",
        "flex flex-row! gap-4 p-3 sm:gap-5 sm:p-4",
        className
      )}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block h-40 w-28 shrink-0 overflow-hidden rounded-xl bg-black focus-visible:ring-2 focus-visible:ring-white sm:h-44 sm:w-32"
        title="Open series"
        onClick={(e) => onClick && e.stopPropagation()}
      >
        <Cover
          src={cover}
          alt={title}
          titleKey={titleKey}
          size="lg"
          withRetry
          className="!h-full !w-full !rounded-none !aspect-auto object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />
        {overlaySource && (
          <span className={`absolute top-2 left-2 text-[9px] font-bold px-1.5 py-1 rounded-md capitalize shadow-sm ${pillCls}`}>
            {overlaySource}
          </span>
        )}
      </a>
      <div className="flex min-w-0 flex-1 flex-col py-0.5 sm:py-1">{children}</div>
    </Card>
  );
}

export function SeriesTitle({
  title,
  seriesUrl,
}: {
  title: string;
  seriesUrl: string;
}) {
  const href = safeUrl(seriesUrl) || "#";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block focus-visible:ring-2 focus-visible:ring-white rounded"
      title="Open series"
    >
      <h3
        className="text-[14px] sm:text-[15px] font-semibold leading-snug truncate text-white group-hover:text-white/80 transition-colors"
        style={{ fontFamily: '"Space Grotesk", var(--font-sans)' }}
      >
        {decodeHtml(title)}
      </h3>
    </a>
  );
}

export function FlatBadgeRow({
  source,
  origin,
  type,
  chapterLabel,
  isNew,
  isSent,
  createdAt,
}: {
  source: string;
  origin: string;
  type?: string | null;
  chapterLabel: string;
  isNew?: boolean;
  isSent?: boolean;
  createdAt?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      <SourceChip source={source} />
      <OriginFlag origin={origin} type={type} />
      {chapterLabel !== "?" ? (
        <Badge
          variant="secondary"
          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/8"
        >
          Ch. {chapterLabel}
        </Badge>
      ) : null}
      {isNew && (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/10">
          NEW
        </span>
      )}
      {isSent && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-white/70 border border-white/8">
          <Check size={10} weight="bold" /> Sent
        </span>
      )}
      {createdAt && (
        <span className="text-[10px] text-white/40 tabular-nums">
          {new Date(createdAt).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

export function GroupedBadgeRow({
  source,
  origin,
  type,
  count,
  isNew,
  isSent,
}: {
  source?: string;
  origin: string;
  type?: string | null;
  count: number;
  isNew?: boolean;
  isSent?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      <SourceChip source={source ?? ""} />
      <OriginFlag origin={origin} type={type} />
      <Badge
        variant="secondary"
        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/8"
      >
        {count} ch
      </Badge>
      {isNew && (
        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/10">
          NEW
        </span>
      )}
      {isSent && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-white/70 border border-white/8">
          <Check size={10} weight="bold" /> Sent
        </span>
      )}
    </div>
  );
}

export function RatingRow({
  rating,
  genres,
}: {
  rating?: string | number | null;
  genres?: string[];
}) {
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <RatingStars rating={rating} />
      <GenreChips genres={genres} />
    </div>
  );
}

export function Synopsis({ text }: { text?: string | null }) {
  return (
    <p className="text-[11px] leading-[1.45] text-white/55 line-clamp-2 mt-1.5">
      {text ? decodeHtml(text) : "-"}
    </p>
  );
}

export function CardActions({
  isWhitelisted,
  sources,
  whitelistedSources,
  onAddSource,
  isExcluded,
  excluding,
  onExclude,
  adding,
  onAdd,
  isRead,
  onToggleRead,
  showRead = true,
  showAdd = true,
}: {
  isWhitelisted: boolean;
  /** Every source this series appears on. */
  sources?: string[];
  /**
   * Sources of this series that ARE whitelisted. When the series is carried by
   * several sources this is what decides the Add button, not `isWhitelisted`:
   * a group whitelisted on shinigami alone must still offer Add for voratoon,
   * otherwise the row is unreachable (the button is the only way to subscribe).
   */
  whitelistedSources?: string[];
  /** Subscribe ONE source of a multi-source series. */
  onAddSource?: (source: string) => void;
  isExcluded: boolean;
  excluding: boolean;
  onExclude: () => void;
  adding: boolean;
  onAdd: () => void;
  isRead?: boolean;
  onToggleRead?: () => void;
  showRead?: boolean;
  showAdd?: boolean;
}) {
  const showAddEff = showAdd;
  const showExcludeEff = !isWhitelisted;
  // Completed = tamat + exclude from RSS — from /recent, not whitelist
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-auto pt-3">
      {showRead && onToggleRead && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleRead();
          }}
          aria-pressed={isRead}
          className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/8 text-white/70 hover:text-white hover:bg-white/10 transition-colors min-h-0 min-w-0"
        >
          {isRead ? <Check size={13} weight="bold" /> : null}
          {isRead ? "Read" : "Mark read"}
        </button>
      )}
      {showExcludeEff &&
        (isExcluded ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExclude();
            }}
            disabled={excluding}
            title="Remove from excluded"
            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/8 text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 min-h-0 min-w-0"
          >
            <Eye size={13} weight="bold" /> {excluding ? "..." : "Show"}
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExclude();
            }}
            disabled={excluding}
            title="Exclude this title"
            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/8 text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 min-h-0 min-w-0"
          >
            <EyeSlash size={13} weight="bold" /> {excluding ? "..." : "Exclude"}
          </button>
        ))}
      {isWhitelisted ? (
        <>
          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-green-500/12 text-green-400 border border-green-500/20 font-medium ml-auto">
            <CheckCircle size={13} weight="fill" /> Verified
          </span>
          {showAddEff &&
            onAddSource &&
            (sources ?? []).map((src) => {
              if ((whitelistedSources ?? []).includes(src)) return null;
              return (
                <button
                  key={src}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddSource(src);
                  }}
                  disabled={adding}
                  title={`Add ${src} to whitelist`}
                  className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors disabled:opacity-50 min-h-0 min-w-0 border ${sourceBadgeClass(src)}`}
                >
                  <Plus size={12} weight="bold" />
                  {adding ? "..." : src}
                </button>
              );
            })}
        </>
      ) : (
        showAddEff && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            disabled={adding}
            className="inline-flex items-center gap-1 text-[11px] px-3 py-1 rounded-full bg-white text-black hover:bg-white/90 font-semibold transition-colors disabled:opacity-50 ml-auto min-h-0 min-w-0 shadow-[0_2px_10px_rgba(255,255,255,0.08)]"
          >
            <Plus size={13} weight="bold" /> {adding ? "..." : "Add WL"}
          </button>
        )
      )}
    </div>
  );
}

export function ChapterChips({
  chapters,
  seriesTitle,
  seriesTitleKey,
  seriesCover,
  seriesUrl,
  origin,
  trackChapter,
  readUrls,
  onToggleRead,
}: {
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
  seriesTitle: string;
  seriesTitleKey: string;
  seriesCover: string;
  seriesUrl: string;
  origin: string;
  trackChapter: (e: any) => void;
  readUrls?: Set<string>;
  onToggleRead?: (url: string) => void;
}) {
  const safeCh = Array.isArray(chapters) ? chapters : [];
  if (safeCh.length > 0 && safeCh.every((c) => getChapterLabel(c) === "?")) {
    return (
      <div className="flex gap-1.5 flex-wrap mt-1.5">
        <a
          href={safeUrl(seriesUrl) || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition-colors whitespace-nowrap"
        >
          View Series
        </a>
      </div>
    );
  }
  const [expanded, setExpanded] = useState(false);
  const allSameSource = safeCh.length > 0 && safeCh.every((c) => c.source === safeCh[0].source);
  const visible = expanded ? safeCh : safeCh.slice(0, 12);
  const hiddenCount = safeCh.length - visible.length;
  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
        {visible.map((ch) => {
          const label = getChapterLabel(ch);
          if (label === "?") return null;
          const chHref = safeUrl(ch.chapterUrl || ch.url) || "#";
          const src = ch.source?.toLowerCase();
          const isRead = !!(
            readUrls &&
            (readUrls.has(ch.url) ||
              readUrls.has(ch.chapterUrl) ||
              readUrls.has(chHref))
          );
          const chipColor = sourceChapterChipClass(src);
          return (
            <span key={ch.key} className="inline-flex items-center gap-1 min-w-0">
              <a
                href={chHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackChapter({
                    title: seriesTitle,
                    titleKey: seriesTitleKey,
                    cover: seriesCover,
                    source: ch.source,
                    chapter: ch.chapter,
                    chapterLabel: ch.chapterLabel,
                    chapterNumber: ch.chapterNumber,
                    chapterUrl: chHref !== "#" ? chHref : ch.chapterUrl || ch.url,
                    seriesUrl,
                    origin,
                  })
                }
                title={`${ch.source} · Ch. ${label}${ch.sentAt ? ` · ${new Date(ch.sentAt).toLocaleDateString()}` : ""}`}
                className={`flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-full border transition-colors whitespace-nowrap min-w-0 truncate ${chipColor} ${isRead ? "opacity-40 line-through" : ""}`}
              >
                {allSameSource ? `Ch. ${label}` : <><span className="capitalize hidden sm:inline">{ch.source}</span> {label}</>}
                {isRead ? " ✓" : ""}
              </a>
              {onToggleRead && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleRead(
                      chHref !== "#" ? chHref : ch.chapterUrl || ch.url
                    );
                  }}
                  title={isRead ? "Mark unread" : "Mark read"}
                  className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full border text-[10px] ${isRead ? "bg-white/10 border-white/20 text-white/60 hover:bg-white/15" : "bg-white/5 border-white/8 text-white/40 hover:text-white hover:bg-white/10"}`}
                >
                  {isRead ? <EyeSlash size={12} /> : <Eye size={12} />}
                </button>
              )}
            </span>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[11px] px-3 py-1 rounded-full bg-white/5 border border-white/8 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          +{hiddenCount} more
        </button>
      )}
      {expanded && safeCh.length > 12 && (
        <button
          onClick={() => setExpanded(false)}
          className="text-[11px] px-3 py-1 rounded-full bg-white/5 border border-white/8 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          Show less
        </button>
      )}
    </div>
  );
}
