import { useState, useEffect, useCallback, useRef } from "react";

const LS_KEY = "home_read_items";
export function useReadItems() {
  const [readItems, setReadItems] = useState<Set<string>>(new Set());
  const hasHydrated = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setReadItems(new Set(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
    hasHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydrated.current) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify([...readItems]));
    } catch {
      /* quota exceeded — ignore */
    }
  }, [readItems]);

  const toggleRead = useCallback((url: string) => {
    setReadItems((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const markAllRead = useCallback((urls: string[]) => {
    setReadItems((prev) => {
      const next = new Set(prev);
      urls.forEach((u) => next.add(u));
      return next;
    });
  }, []);

  // Toggle a whole series: marks all its chapter URLs read when any is
  // unread, or unmarks all when every chapter is already read.
  const toggleReadAll = useCallback((urls: string[]) => {
    setReadItems((prev) => {
      const next = new Set(prev);
      const allRead = urls.length > 0 && urls.every((u) => prev.has(u));
      if (allRead) {
        urls.forEach((u) => next.delete(u));
      } else {
        urls.forEach((u) => next.add(u));
      }
      return next;
    });
  }, []);

  return { readItems, toggleRead, toggleReadAll, markAllRead };
}
