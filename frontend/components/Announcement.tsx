"use client";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const DISMISS_KEY = "announcement_dismissed_at";
const DISMISS_TTL = 24 * 60 * 60 * 1000;

export default function Announcement() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(DISMISS_KEY);
      if (v && Date.now() - Number(v) < DISMISS_TTL) setDismissed(true);
    } catch {}
  }, []);

  const { data: count } = useQuery({
    queryKey: ["announcement", "latest-count"],
    queryFn: async () => {
      const res = await fetch("/api/v1/reader/rss?limit=1&group=false", { cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      const d = j?.data as { total?: number } | undefined;
      return d ?? null;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: health } = useQuery({
    queryKey: ["announcement", "health"],
    queryFn: async () => {
      const res = await fetch("/api/v1/dashboard/snapshot", { cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      const h = j?.data?.sourceHealth as Record<string, { status: string }> | undefined;
      if (!h) return null;
      const degraded = Object.entries(h)
        .filter(([, v]) => (v.status || "").toLowerCase() !== "healthy")
        .map(([k]) => k);
      return degraded;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const total = count?.total ?? null;
  const shouldShow = !dismissed && !(total == null && (!health || health.length === 0));
  const degraded = health && health.length > 0 ? ` • ${health.join(", ")} degraded` : "";

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="w-full bg-zinc-900 border-b border-white/10 text-white text-xs font-medium py-1.5 px-3 flex items-center gap-2 overflow-hidden"
        >
          <span className="flex-1 text-center">
            ✨ {total ?? "?"} new releases today — don&apos;t miss out!{degraded}
          </span>
          <button
            aria-label="Dismiss"
            onClick={() => {
              try {
                localStorage.setItem(DISMISS_KEY, String(Date.now()));
              } catch {}
              setDismissed(true);
            }}
            className="shrink-0 inline-flex items-center justify-center w-6 h-6 text-white/60 hover:text-white transition-colors text-sm leading-none"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
