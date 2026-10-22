"use client";
import { forwardRef } from "react";

interface Props {
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  filteredLength: number;
  groupedLength: number;
}

const InfiniteSentinel = forwardRef<HTMLDivElement, Props>(
  function InfiniteSentinel(
    { hasMore, loadingMore, onLoadMore, filteredLength, groupedLength },
    ref
  ) {
    if (hasMore) {
      return (
        <div
          ref={ref}
          className="flex items-center justify-center gap-2 py-6 min-h-10"
          aria-live="polite"
        >
          {loadingMore ? (
            <>
              <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
              <span className="text-xs text-white/50">Loading more…</span>
            </>
          ) : (
            <span className="sr-only" aria-hidden />
          )}
        </div>
      );
    }
    if (filteredLength > 0) {
      return (
        <div className="flex items-center gap-3 py-8">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-white/50 shrink-0">
            All {groupedLength} series loaded · {filteredLength} chapters
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>
      );
    }
    return null;
  }
);

export default InfiniteSentinel;
