import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

interface VirtualizedListProps<T> {
  items: T[];
  gap?: number;
  estimateSize?: number;
  overscan?: number;
  chunkSize?: number;
  scrollToTitleKey?: string | null;
  titleKeyOf?: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  initialScrollOffset?: number;
}

export default function VirtualizedList<T>({
  items: itemsProp,
  gap = 12,
  estimateSize = 150,
  overscan = 5,
  chunkSize = 1,
  scrollToTitleKey,
  titleKeyOf,
  renderItem,
  initialScrollOffset,
}: VirtualizedListProps<T>) {
  const items = (Array.isArray(itemsProp) ? itemsProp : []) as T[];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [cols, setCols] = useState(2);
  useEffect(() => {
    if (chunkSize <= 1) return;
    const mq = window.matchMedia("(min-width: 640px)");
    const mqLg = window.matchMedia("(min-width: 1024px)");
    const update = () => setCols(mqLg.matches ? 4 : mq.matches ? 3 : 2);
    update();
    mq.addEventListener("change", update);
    mqLg.addEventListener("change", update);
    return () => {
      mq.removeEventListener("change", update);
      mqLg.removeEventListener("change", update);
    };
  }, [chunkSize]);
  const effectiveChunk = chunkSize > 1 ? cols : chunkSize;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        setScrollMargin(r.top + window.scrollY);
      });
    };
    update();
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, []);

  const rows = useMemo(() => {
    const safe = Array.isArray(items) ? items : [];
    if (effectiveChunk <= 1) return safe.map((it) => [it]);
    const out: T[][] = [];
    for (let i = 0; i < safe.length; i += effectiveChunk) {
      out.push(safe.slice(i, i + effectiveChunk));
    }
    return out;
  }, [items, effectiveChunk]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => estimateSize,
    overscan,
    gap,
    scrollMargin,
    initialOffset: initialScrollOffset,
    // Auto-tune measurement: dynamic measurement (`measureRef` +
    // `virtualizer.measureElement`) keeps item sizes exact, so the
    // virtualizer can also use a dynamic fallback estimate when a row is
    // not yet measured. Without this it sticks with the static estimate
    // for every unmeasured row and every fast-scroll session begins with
    // jittery blanks until `measureRef` catches up.
    measureElement: (el) =>
      el.getBoundingClientRect().height + (gap || 0),
  });

  // Dynamic measurement: content height unknown until rendered (cover + text)
  const measureRef = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      queueMicrotask(() => {
        try {
          virtualizer.measureElement(el);
        } catch {}
      });
    },
    [virtualizer]
  );

  const anchorIndexRef = useRef<number | null>(null);
  useEffect(() => {
    const onScroll = () => {
      const first = virtualizer.getVirtualItems()[0];
      if (first) anchorIndexRef.current = first.index;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [virtualizer]);

  // When items prepend (new chapters at top), restore anchor. Append (infinite load older) should not jump.
  const prevLenRef = useRef((items ?? []).length);
  const prevFirstKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const safe = Array.isArray(items) ? items : [];
    const firstKey = safe.length > 0 && titleKeyOf ? titleKeyOf(safe[0]) : safe[0] != null ? String((safe[0] as unknown as Record<string, unknown>).titleKey ?? "") : null;
    const lenDiff = safe.length - prevLenRef.current;
    const isPrepend = firstKey !== null && prevFirstKeyRef.current !== null && firstKey !== prevFirstKeyRef.current;
    if (lenDiff > 0 && isPrepend && anchorIndexRef.current !== null) {
      const anchor = anchorIndexRef.current + lenDiff;
      virtualizer.scrollToIndex(anchor, { align: "start" });
    }
    prevLenRef.current = safe.length;
    prevFirstKeyRef.current = firstKey;
  }, [items, titleKeyOf, virtualizer]);

  const scrollRestoredRef = useRef(false);

  // Deep-link & snapshot restore — guard initial restore with ref (runs once)
  useEffect(() => {
    const safe = Array.isArray(items) ? items : [];
    if (scrollToTitleKey && titleKeyOf) {
      const idx = safe.findIndex(
        (it) => titleKeyOf(it).toLowerCase() === scrollToTitleKey.toLowerCase()
      );
      if (idx !== -1) {
        const rowIndex =
          effectiveChunk <= 1 ? idx : Math.floor(idx / effectiveChunk);
        const t = setTimeout(
          () => virtualizer.scrollToIndex(rowIndex, { align: "center" }),
          300
        );
        return () => clearTimeout(t);
      }
    }
    if (!scrollRestoredRef.current && initialScrollOffset !== undefined && initialScrollOffset > 0) {
      scrollRestoredRef.current = true;
      virtualizer.scrollToOffset(initialScrollOffset);
    }
  }, [
    scrollToTitleKey,
    items,
    effectiveChunk,
    titleKeyOf,
    virtualizer,
    initialScrollOffset,
  ]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ height: `${totalSize}px` }}
    >
      {virtualItems.map((vi) => {
        const rowItems = rows[vi.index] ?? [];
        const first = rowItems[0] as unknown as Record<string, unknown> | undefined;
        const chapterRowKey =
          (first?.key as string) ||
          (first?.chapterKey as string) ||
          (first?.titleKey && first?.source && (first?.chapterUrl || first?.url || first?.chapter)
            ? `${first.titleKey}:${first.source}:${(first.chapterUrl as string) || (first.url as string) || (first.chapter as string)}`
            : "");
        const rowKey =
          chapterRowKey ||
          (titleKeyOf && rowItems[0] ? titleKeyOf(rowItems[0] as T) : String(vi.key));
        return (
          <div
            key={rowKey}
            data-index={vi.index}
            ref={measureRef}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${vi.start - scrollMargin}px)` }}
          >
            {effectiveChunk <= 1 ? (
              renderItem(rowItems[0], vi.index)
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {rowItems.map((it, k) => {
                  const realIndex = vi.index * effectiveChunk + k;
                  const c = it as unknown as Record<string, unknown>;
                  const chapterKey =
                    (c.key as string) ||
                    (c.chapterKey as string) ||
                    (c.titleKey && c.source
                      ? `${c.titleKey}:${c.source}:${(c.chapterUrl as string) || (c.url as string) || (c.chapter as string) || ""}`
                      : "");
                  const itemKey = chapterKey || (titleKeyOf ? titleKeyOf(it) : "") || String(realIndex);
                  return <div key={itemKey}>{renderItem(it, realIndex)}</div>;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
