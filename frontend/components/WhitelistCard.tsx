"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Trash } from "@phosphor-icons/react";
import MangaCard from "@/components/MangaCard";
import { Reader } from "@/lib/reader";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/lib/useToast";
import type { WhitelistRouteItem } from "@/lib/types";

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
function resolveDetailUrl(item: WhitelistRouteItem): string | undefined {
  if (item.seriesUrl && /^https?:\/\//.test(item.seriesUrl))
    return item.seriesUrl;
  if (item.url && /^https?:\/\//.test(item.url)) return item.url;
  const title = (item as unknown as { title?: string }).title || "";
  const sources = (() => {
    const s: string[] = [];
    if (item.source) s.push(item.source);
    if (Array.isArray(item.sources))
      for (const x of item.sources)
        s.push(typeof x === "string" ? x : (x as { source: string }).source);
    return s.map((x) => x.toLowerCase());
  })();
  const slug = slugFromTitle(title);
  if (!slug) return undefined;
  if (sources.includes("shinigami")) {
    const raw =
      (item as unknown as { titleKey?: string }).titleKey || item.id || "";
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        raw
      );
    return isUuid
      ? `https://11.shinigami.asia/series/${raw}`
      : `https://11.shinigami.asia/series/${slug}`;
  }
  // Voratoon routes by slug too, so no uuid special case is needed.
  if (sources.includes("voratoon")) {
    return `https://v4.voratoon.com/series/${slug}`;
  }
  return undefined;
}
import { useRef } from "react";

export function WhitelistCard({
  item,
  onRefetch,
}: {
  item: WhitelistRouteItem;
  onRefetch: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const pendingDeleteRef = useRef<Promise<unknown> | null>(null);

  const handleRemove = () => {
    // BE b8963fc: titleKey is canonical slug (not UUID), 1 row per title — delete by titleKey only
    // item can carry UUID as titleKey (old data) but BE dedups by canonical_title_key/slug — prefer canonical
    const rawAny = item as unknown as Record<string, unknown>;
    const canonical =
      (rawAny.canonical_title_key as string) ||
      (rawAny.canonicalTitleKey as string) ||
      "";
    const rawTitleKey =
      (item as unknown as { titleKey?: string }).titleKey ||
      (item as unknown as { title_key?: string }).title_key ||
      item.id ||
      "";
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        rawTitleKey
      );
    // BE key is lowercased title with spaces (e.g. "transcension academy"), not dashed slug
    const lowerTitle = item.title.toLowerCase().trim().slice(0, 80);
    const dashedSlug = item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    const titleKey =
      canonical ||
      (isUuid ? lowerTitle : rawTitleKey) ||
      rawTitleKey ||
      lowerTitle ||
      dashedSlug;

    // sources only needed for Undo (re-add per source)
    const rawSources = (
      item.sources && item.sources.length > 0
        ? item.sources
        : item.source
          ? [item.source]
          : []
    ) as (string | { source: string })[];
    const sources = rawSources
      .map((s) =>
        typeof s === "string" ? s : (s as { source: string }).source
      )
      .filter((s): s is string => typeof s === "string" && s.length > 0);
    const effectiveSources =
      sources.length > 0 ? sources : item.source ? [item.source] : [];
    const fallbackKey =
      (rawAny.canonical_title_key as string) ||
      (rawAny.canonicalTitleKey as string) ||
      (item as unknown as { titleKey?: string }).titleKey ||
      (item as unknown as { title_key?: string }).title_key ||
      "";
    // whitelist sekarang terpisah per source (merge=false) — optimistic filter harus source-aware
    const deleteSource =
      effectiveSources.length === 1 ? effectiveSources[0] : "";
    queryClient.setQueryData<WhitelistRouteItem[]>(
      queryKeys.whitelist(false),
      (old) =>
        old
          ? old.filter((it) => {
              const itKey =
                (it as unknown as { titleKey?: string }).titleKey ||
                (it as unknown as { title_key?: string }).title_key ||
                (it as unknown as { id?: string }).id ||
                "";
              const itSource =
                (it as unknown as { source?: string }).source || "";
              const itSources = (it as unknown as { sources?: unknown })
                .sources;
              const itSourceList: string[] = Array.isArray(itSources)
                ? (itSources
                    .map((s) =>
                      typeof s === "string"
                        ? s
                        : (s as { source: string }).source
                    )
                    .filter(Boolean) as string[])
                : [];
              // jika delete per source, hanya hapus yang source-nya match
              if (deleteSource) {
                const keyMatch =
                  (fallbackKey && itKey === fallbackKey) ||
                  (!fallbackKey && itKey === titleKey);
                const sourceMatch =
                  itSource === deleteSource ||
                  itSourceList.includes(deleteSource);
                if (keyMatch && sourceMatch) return false;
                // jika key sama tapi source beda, jangan hapus (biarin terpisah)
                if (keyMatch && !sourceMatch) return true;
              }
              if (fallbackKey && itKey === fallbackKey) return false;
              if (!fallbackKey && itKey === titleKey) return false;
              // fallback: match by title if titleKey missing (defensive)
              if (
                !itKey &&
                (it as unknown as { title?: string }).title === item.title
              )
                return false;
              return true;
            })
          : old
    );
    toast(`Removed ${item.title}`, {
      type: "info",
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          const del = pendingDeleteRef.current;
          pendingDeleteRef.current = null;
          (del ?? Promise.resolve())
            .catch(() => {})
            .then((): Promise<void> => {
              if (effectiveSources.length === 0) {
                return Reader.addWhitelistEntry({
                  title: item.title,
                  seriesUrl: item.seriesUrl ?? undefined,
                  title_key: titleKey,
                  cover: item.cover ?? undefined,
                  rating: item.rating ?? undefined,
                  origin: item.origin ?? undefined,
                  description: item.description ?? undefined,
                } as Record<string, unknown>).then(() => undefined);
              }
              return Promise.all(
                effectiveSources.map((s) =>
                  Reader.addWhitelistEntry({
                    title: item.title,
                    seriesUrl: item.seriesUrl ?? undefined,
                    source: s,
                    title_key: titleKey,
                    cover: item.cover ?? undefined,
                    rating: item.rating ?? undefined,
                    origin: item.origin ?? undefined,
                    description: item.description ?? undefined,
                  } as Record<string, unknown>)
                )
              ).then(() => undefined);
            })
            .then(() => onRefetch())
            .catch(() => onRefetch());
        },
      },
    });
    // Single DELETE by title_key + url/title fallback — backend matches any of these keys
    const deletePayload: {
      title_key?: string;
      title?: string;
      url?: string;
      source?: string;
    } = {};
    if (titleKey) deletePayload.title_key = titleKey;
    if (item.title) deletePayload.title = item.title;
    const urlVal =
      (item as unknown as { seriesUrl?: string; url?: string }).seriesUrl ||
      (item as unknown as { url?: string }).url ||
      "";
    if (urlVal) deletePayload.url = urlVal;
    // include source as extra matcher if single source (helps if backend still per-source)
    if (effectiveSources.length === 1)
      deletePayload.source = effectiveSources[0];
    pendingDeleteRef.current = Reader.removeWhitelistEntry(
      deletePayload as Record<string, unknown>
    )
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.whitelist(false) });
        queryClient.invalidateQueries({ queryKey: queryKeys.whitelist(true) });
        queryClient.invalidateQueries({ queryKey: queryKeys.whitelistAll });
        queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
        queryClient.invalidateQueries({ queryKey: ["rss-feed-flat"] });
        queryClient.invalidateQueries({ queryKey: ["rss-feed-flat-infinite"] });
        queryClient.invalidateQueries({ queryKey: queryKeys.rssFeedInfinite() });
        queryClient.invalidateQueries({ queryKey: queryKeys.excludedTitles });
        queryClient.invalidateQueries({
          queryKey: queryKeys.dashboardSnapshot,
        });
        onRefetch();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        toast(`Failed to delete: ${msg}`, { type: "error" });
        onRefetch();
      });
  };

  return (
    <div className="relative group/card">
      <MangaCard
        title={item.title}
        cover={item.cover}
        id={item.id}
        rating={item.rating}
        origin={item.origin}
        type={item.type}
        source={item.source}
        sources={item.sources}
        description={item.description}
        genres={item.genres}
        lastNotified={item.lastNotified}
        detailUrl={resolveDetailUrl(item)}
        titleKey={item.id}
      />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleRemove();
        }}
        className="absolute bottom-2 right-2 z-20 size-9 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md border border-white/15 hover:bg-red-500 hover:border-red-500 text-white shadow-lg shadow-black/30 opacity-100 lg:opacity-0 lg:group-hover/card:opacity-100 lg:group-focus-within/card:opacity-100 focus:opacity-100 focus-visible:opacity-100 transition-all duration-200 hover:scale-105 active:scale-95"
        aria-label={`Remove ${item.title} from whitelist`}
        title="Remove from whitelist"
      >
        <Trash size={16} weight="bold" className="shrink-0" />
      </button>
    </div>
  );
}
