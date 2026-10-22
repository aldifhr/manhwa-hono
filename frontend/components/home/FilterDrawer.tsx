"use client";
import { useQuery } from "@tanstack/react-query";
import { Reader } from "@/lib/reader";
import { queryKeys, staleTimes, gcTimes } from "@/lib/queryKeys";
import { filterButtonClass } from "@/lib/styles";
import { X } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { useUiStore } from "@/lib/uiStore";

export default function FilterDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const genreFilter = useUiStore((s) => s.genreFilter);
  const minRating = useUiStore((s) => s.minRating);
  const whitelistOnly = useUiStore((s) => s.whitelistOnly);
  const setGenreFilter = useUiStore((s) => s.setGenreFilter);
  const setMinRating = useUiStore((s) => s.setMinRating);
  const setWhitelistOnly = useUiStore((s) => s.setWhitelistOnly);
  const resetFilters = useUiStore((s) => s.resetFilters);

  const { data: meta } = useQuery({
    queryKey: queryKeys.rssFilterMetadata,
    queryFn: () => Reader.getRssFilterMetadata() as Promise<{ genres: string[] }>,
    staleTime: staleTimes.rssFilterMetadata,
    gcTime: gcTimes.rssFilterMetadata,
    enabled: open,
  });

  const genres = (meta as { genres?: string[] })?.genres ?? ["Action", "Fantasy", "Romance", "Comedy", "Drama", "Adventure"];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-[84%] max-w-[360px] h-full bg-zinc-950 border-l border-white/10 flex flex-col"
          >
        <div className="flex items-center justify-between h-14 px-4 border-b border-white/10">
          <span className="font-semibold text-white">Filters</span>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/70">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <p className="text-xs font-semibold tracking-widest uppercase text-white/40 mb-2">Genre</p>
            <div className="flex flex-wrap gap-1.5">
              <motion.button layout onClick={() => setGenreFilter(null)} className={filterButtonClass(genreFilter === null)}>All</motion.button>
              {genres.slice(0, 12).map((g) => (
                <motion.button layout key={g} onClick={() => setGenreFilter(genreFilter === g ? null : g)} className={filterButtonClass(genreFilter === g)}>
                  {g}
                </motion.button>
              ))}
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <p className="text-xs font-semibold tracking-widest uppercase text-white/40 mb-2">Rating ≥ {minRating ?? "Any"}</p>
            <div className="flex gap-1.5">
              {[null, "7", "8", "8.5", "9"].map((r) => (
                <motion.button layout key={r ?? "any"} onClick={() => setMinRating(r)} className={filterButtonClass(minRating === r)}>
                  {r ?? "Any"}
                </motion.button>
              ))}
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <p className="text-xs font-semibold tracking-widest uppercase text-white/40 mb-2">Other</p>
            <div className="flex flex-wrap gap-1.5">
              <motion.button layout onClick={() => setWhitelistOnly(!whitelistOnly)} className={filterButtonClass(whitelistOnly)}>Whitelist only</motion.button>
            </div>
          </motion.div>
        </div>
        <div className="p-4 border-t border-white/10 flex gap-2">
          <button onClick={() => { resetFilters(); onClose(); }} className="flex-1 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm">Clear</button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-white text-black text-sm font-medium">Apply</button>
        </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
