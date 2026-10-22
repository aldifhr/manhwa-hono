"use client";
import { useState, useCallback, useEffect } from "react";

const LS_KEY = "home_pinned";

export function usePinnedSet() {
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setPinnedSet(new Set(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);

  const togglePin = useCallback((titleKey: string) => {
    setPinnedSet((prev) => {
      const n = new Set(prev);
      if (n.has(titleKey)) n.delete(titleKey);
      else n.add(titleKey);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify([...n]));
      } catch {
        /* quota ignore */
      }
      return n;
    });
  }, []);

  return { pinnedSet, togglePin } as const;
}
