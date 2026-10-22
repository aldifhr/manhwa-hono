"use client";

import { useEffect, useState } from "react";

/**
 * The previous-visit cutoff, shared by the nav badge and the Baru badges.
 *
 * The navbar advances `rss:lastSeen` shortly after /recent opens, so the
 * window covers chapters released between two visits rather than "today".
 * On a first visit there is no stored value; useFeedGrouping falls back to a
 * 24h window, which is also what the nav badge reports.
 */
const LAST_SEEN_KEY = "rss:lastSeen";

/** How long a chapter counts as new after the previous visit. */
const MAX_WINDOW_MS = 7 * 24 * 3600 * 1000;

export function readLastSeen(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function useLastSeen(): number {
  const [lastSeen, setLastSeen] = useState<number>(0);

  useEffect(() => {
    setLastSeen(readLastSeen());
    // The navbar dispatches this when it advances the key.
    const onSeen = () => setLastSeen(readLastSeen());
    window.addEventListener("rss:seen", onSeen);
    return () => window.removeEventListener("rss:seen", onSeen);
  }, []);

  return lastSeen;
}
