"use client";

import { BookOpen } from "@phosphor-icons/react";

import { useContinueReading } from "@/lib/continueReading";
import type { ContinueReadingEntry } from "@/lib/continueReading";
import { decodeHtml, getChapterLabel, rewriteCoverUrl } from "@/lib/utils";
import { sourceBadgeClass } from "@/lib/styles";
import { motion } from "framer-motion";

function CoverImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="w-full aspect-3/4 rounded-xl cover-placeholder flex items-center justify-center bg-surface border border-white/6">
        <BookOpen size={24} className="text-white/30" />
      </div>
    );
  }
  return (
    <img
      src={rewriteCoverUrl(src) || src}
      alt={alt}
      className="w-full aspect-3/4 object-cover bg-surface group-hover:scale-[1.03] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
      loading="lazy"
    />
  );
}

function SourcePill({ source }: { source: string }) {
  const s = source?.toLowerCase();
  const cls = sourceBadgeClass(s);
  return (
    <span
      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize backdrop-blur-md border shadow-sm ${cls}`}
    >
      {source}
    </span>
  );
}

function ContinueReadingCard({ entry, onRemove }: { entry: ContinueReadingEntry; onRemove?: () => void }) {
  const label = getChapterLabel({ chapterLabel: entry.lastChapter });
  const displayLabel = label === "?" ? entry.lastChapter : label;
  return (
    <div className="group shrink-0 w-36 sm:w-44 relative">
      {onRemove && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          aria-label="Remove"
          className="absolute -right-1 -top-1 z-10 w-6 h-6 rounded-full bg-black/70 border border-white/15 text-white/70 hover:text-white hover:bg-black/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
      <a
        href={entry.chapterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <div className="relative overflow-hidden rounded-xl card-hover border border-white/8 hover:border-white/15 bg-surface">
          <CoverImage src={entry.cover} alt={decodeHtml(entry.title)} />
          <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          <div className="absolute top-2.5 left-2.5">
            <SourcePill source={entry.source} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black via-black/70 to-transparent pt-6 p-2.5">
            <p className="text-[11px] font-bold tracking-wide text-white">
              Ch. {displayLabel}
            </p>
          </div>
        </div>
      </a>
      <div className="mt-2.5 px-1">
        <h3 className="text-xs sm:text-[13px] font-semibold leading-snug text-white line-clamp-2 min-h-[2.2rem] group-hover:text-white/80 transition-colors">
          {decodeHtml(entry.title)}
        </h3>
        <p className="text-[10px] text-white/45 mt-1 tracking-wide">
          {entry.origin ? `${entry.origin} • ${entry.source}` : entry.source}
        </p>
      </div>
    </div>
  );
}

export default function ContinueReadingStrip() {
  const { entries, clearAll, removeReading } = useContinueReading();

  const sortedEntries = [...entries.values()]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  if (sortedEntries.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white">
          Continue Reading
        </h2>

        <span className="text-xs text-white/50">({sortedEntries.length})</span>
        <button
          onClick={clearAll}
          className="ml-auto text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory justify-start">
        {sortedEntries.map((entry, i) => (
          <motion.div
            key={entry.titleKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
          >
            <ContinueReadingCard entry={entry} onRemove={() => removeReading(entry.titleKey)} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
