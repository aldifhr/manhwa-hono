"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Reader } from "@/lib/reader";

const LAST_SEEN_KEY = "rss:lastSeen";
const POLL_MS = 60_000;

function getLastSeen(): number {
  try {
    const v = localStorage.getItem(LAST_SEEN_KEY);
    if (v) return Number(v) || Date.now() - 24 * 3600 * 1000;
  } catch {}
  return Date.now() - 24 * 3600 * 1000;
}

export function useNewCount() {
  const [lastSeen, setLastSeen] = useState<number>(() => {
    if (typeof window === "undefined") return Date.now() - 24 * 3600 * 1000;
    return getLastSeen();
  });

  // bump lastSeen when user visits /recent and we mark read
  useEffect(() => {
    const onStorage = () => setLastSeen(getLastSeen());
    window.addEventListener("storage", onStorage);
    // also listen for custom event from Recent page
    window.addEventListener("rss:seen" as any, onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("rss:seen" as any, onStorage);
    };
  }, []);

  const { data } = useQuery({
    queryKey: ["rss-new-count", lastSeen],
    queryFn: () => Reader.countNewSince(lastSeen, { distinct: true }),
    staleTime: 30_000,
    refetchInterval: POLL_MS,
    retry: false,
    refetchOnWindowFocus: true,
  });

  return { count: data ?? 0, lastSeen, markSeen: () => {
    const now = Date.now();
    try { localStorage.setItem(LAST_SEEN_KEY, String(now)); } catch {}
    setLastSeen(now);
    window.dispatchEvent(new Event("rss:seen"));
  }};
}

export function NotificationDot({ count }: { count: number }) {
  if (!count || count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span className="absolute -right-1 -top-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border border-black">
      {label}
    </span>
  );
}
