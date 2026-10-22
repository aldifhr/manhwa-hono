"use client";

import { useQuery } from "@tanstack/react-query";
import { Star, Crown, Fire, TrendUp } from "@phosphor-icons/react";
import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode, Mousewheel } from "swiper/modules";
import "swiper/css";
import "swiper/css/free-mode";
import { decodeHtml, safeUrl } from "@/lib/utils";
import { resolveCoverUrl } from "@/lib/cover";
import { queryKeys, staleTimes, gcTimes } from "@/lib/queryKeys";
import { sourceOverlayClass } from "@/lib/styles";

type RecItem = {
  title: string;
  titleKey: string;
  cover: string;
  seriesUrl: string;
  source: string;
  rating?: number | null;
  views?: number;
  bookmarks?: number;
  genres?: string[];
};

type RecResponse = { success: boolean; data: { results: RecItem[] } };

async function fetchRecommended(): Promise<RecResponse> {
  const r = await fetch("/api/v1/recommended?limit=10", { cache: "no-store", credentials: "include" });
  if (!r.ok) throw new Error("failed");
  return r.json();
}

function fmtViews(n?: number) {
  if (!n) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function RecommendedSection() {
  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.homeFeed, "recommended"] as const,
    queryFn: fetchRecommended,
    staleTime: staleTimes.homeFeed,
    gcTime: gcTimes.homeFeed,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const items = data?.data?.results ?? [];
  if (!isLoading && items.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-orange-500/15 border border-orange-500/20">
          <Fire size={16} className="text-orange-400" weight="fill" />
        </div>
        <div>
          <h2 className="text-[15px] font-bold tracking-[-0.02em] text-white leading-none">Popular Today</h2>
        </div>

      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shrink-0 w-36 sm:w-40">
              <div className="skeleton aspect-3/4 rounded-xl" />
              <div className="skeleton h-3 w-3/4 rounded mt-2" />
              <div className="skeleton h-2 w-1/2 rounded mt-1" />
            </div>
          ))}
        </div>
      ) : (
        <Swiper
          modules={[FreeMode, Mousewheel]}
          slidesPerView="auto"
          spaceBetween={12}
          freeMode={{ enabled: true, momentum: true, momentumBounce: false }}
          mousewheel={{ forceToAxis: true, sensitivity: 1 }}
          grabCursor
          className="!pb-2 !px-1 !-mx-1"
        >
          {items.map((it, idx) => {
            const cover = resolveCoverUrl(it.cover);
            const href = safeUrl(it.seriesUrl) || "#";
            const extHref = href;
            const rank = idx + 1;
            const isTop3 = rank <= 3;
            return (
              <SwiperSlide key={`${it.source}:${it.titleKey}`} className="!w-36 sm:!w-40">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                  draggable={false}
                >
                  <div className="relative overflow-hidden rounded-xl bg-[#111] border border-white/8 group-hover:border-white/15 transition-colors">
                    {cover ? (
                      <img
                        src={cover}
                        alt={decodeHtml(it.title)}
                        className="w-full aspect-3/4 object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full aspect-3/4 bg-white/5 flex items-center justify-center">
                        <span className="text-white/20 text-xs">No cover</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/0 to-transparent pointer-events-none" />
                    <div
                      className={`absolute left-2 top-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-md border ${
                        rank === 1
                          ? "bg-yellow-400 text-black border-yellow-300"
                          : rank === 2
                            ? "bg-zinc-300 text-black border-white"
                            : rank === 3
                              ? "bg-orange-400 text-black border-orange-300"
                              : "bg-black/70 text-white border-white/15 backdrop-blur"
                      }`}
                    >
                      {isTop3 ? <Crown size={12} weight="fill" /> : null}
                      <span className={isTop3 ? "ml-0.5" : ""}>{rank}</span>
                    </div>
                    <span
                      className={`absolute right-2 top-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md capitalize ${sourceOverlayClass(it.source)}`}
                    >
                      {it.source}
                    </span>
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      {it.rating ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-yellow-300 border border-white/10 backdrop-blur">
                          <Star size={10} weight="fill" /> {Number(it.rating).toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <h3 className="mt-2 text-xs font-semibold leading-snug line-clamp-2 text-white group-hover:text-white/80 min-h-[2.2rem]">
                    {decodeHtml(it.title)}
                  </h3>
                  <p className="text-[11px] text-white/45 truncate">
                    {(() => {
                      const v = fmtViews(it.views);
                      const g = it.genres?.[0] || "";
                      const parts = [g, v ? `${v} views` : ""].filter(Boolean);
                      return parts.length ? parts.join(" • ") : it.source;
                    })()}
                  </p>
                </a>
              </SwiperSlide>
            );
          })}
        </Swiper>
      )}
    </section>
  );
}
