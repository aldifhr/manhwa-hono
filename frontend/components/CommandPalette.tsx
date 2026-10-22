"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CommandMenu, openCommandMenu } from "@/components/ui/command-menu";
import { NAV } from "@/lib/nav";
import { queryKeys } from "@/lib/queryKeys";
import { Reader } from "@/lib/reader";
import { search } from "@/lib/command-filter";
import {
  Compass,
  MagnifyingGlass,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { safeUrl } from "@/lib/utils";

/**
 * ⌘K palette: jump to a page, or out to a series page on its source site.
 *
 * The whitelist is 270+ entries and the only way into one today is the text
 * field on /whitelist. This puts every route and every series behind one
 * shortcut, and opens series on the source site in a new tab — the same
 * target the cards use, since there is no internal series detail route.
 *
 * Mounted once in the root layout. openCommandMenu() is exported so any
 * component can summon it without prop drilling.
 */
export function CommandPalette() {
  const router = useRouter();

  // Fetched lazily the first time the menu is summoned, so a page view costs
  // nothing but a full list is ready before anyone starts typing.
  // Same queryKey the whitelist page uses, so this shares one cache entry
  // and the list is usually already warm. Prefetched on idle rather than on
  // open: waiting for the request to start would leave the menu empty for
  // the first keystroke.
  const { data: whitelist } = useQuery({
    queryKey: queryKeys.whitelist(false),
    queryFn: () => Reader.getWhitelist(1, 1000, false) as Promise<unknown>,
    staleTime: 60_000,
  });

  const rows = (whitelist ?? []) as Array<{
    title_key: string;
    title?: string;
    source?: string;
    series_url?: string;
  }>;

  const openSeries = (url: string) => () => {
    openCommandMenu(); // close
    const safe = safeUrl(url);
    if (safe) window.open(safe, "_blank", "noopener,noreferrer");
  };

  const seriesActions = rows
    .filter((s) => !!safeUrl(s.series_url))
    .map((s) => ({
      label: s.title || s.title_key,
      hint: s.source,
      icon: <Compass size={16} />,
      onSelect: openSeries(s.series_url as string),
    }));

  return (
    <CommandMenu
      actions={[
        ...NAV.map(({ href, label, icon: Icon }) => ({
          label,
          icon: <Icon size={16} />,
          onSelect: () => {
            openCommandMenu();
            router.push(href);
          },
        })),
        {
          label: "Search series",
          icon: <MagnifyingGlass size={16} />,
          hint: "270+ titles",
          onSelect: () => {
            openCommandMenu();
            router.push("/whitelist");
          },
        },
        {
          label: "Open series on source",
          icon: <ArrowSquareOut size={16} />,
          hint: "opens in a new tab",
          hidden: true,
          onSelect: () => {},
        },
      ] as never}
      scopes={{
        series: {
          actions: search(seriesActions as never, "") as never,
          placeholder: "Search series…",
          crumb: "series",
        },
      }}
      placeholder="Jump to a page…"
    />
  );
}
