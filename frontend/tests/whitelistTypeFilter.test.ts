import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWhitelistFilters } from "@/components/home/hooks/useWhitelistFilters";
import type { WhitelistRouteItem } from "@/lib/types";

/**
 * Regression: the "Filter by type" dropdown on /whitelist returned ZERO rows
 * for every non-All option.
 *
 * The backend /api/v1/whitelist row carries `format` (manhwa|manhua|manga) and
 * `country` (KR|CN|JP) — it does NOT carry `type` or `origin`. The FE proxy
 * (app/api/v1/whitelist/route.ts) read `item.type` / `item.origin`, so it
 * emitted `type: null, origin: null` on every row. useWhitelistFilters then
 * ran normalizeType(null) -> "no_type" and compared it to "manhwa", so the
 * predicate rejected every item. The dropdown looked like it did nothing.
 */

// Verbatim shape from the live backend (curl 127.0.0.1:3000/api/v1/whitelist).
const backendRow = {
  id: "4319086e-da2e-495a-8d58-78e8dc4013ef",
  title: "World-Saving Is A Skill",
  titleKey: "world-saving-is-a-skill",
  cover: "https://assets.shngm.id/thumbnail/cover/banner.jpg",
  source: "shinigami",
  rating: 7.6,
  format: "manhwa",
  country: "KR",
  genres: ["Action"],
  description: "desc",
  seriesUrl: "https://11.shinigami.asia/series/d3df9d07",
  createdAt: "2026-10-05T16:31:36.853729+00:00",
};

function req(cookie = "manhwa_dashboard_session=x") {
  return {
    nextUrl: {
      searchParams: new URLSearchParams({ page: "1", page_size: "100", merge: "false" }),
    },
    headers: new Headers({ cookie }),
  } as unknown as Parameters<
    typeof import("@/app/api/v1/whitelist/route").GET
  >[0];
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("whitelist proxy — backend format/country must survive as type/origin", () => {
  it("maps backend `format` to `type` and `country` to `origin`", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { results: [backendRow], total: 1, page: 1, pageSize: 100, totalPages: 1 },
        }),
      }))
    );
    const { GET } = await import("@/app/api/v1/whitelist/route");
    const res = await GET(req());
    const body = (await res.json()) as {
      data: { results: Record<string, unknown>[] };
    };
    const row = body.data.results[0];
    expect(row.type).toBe("manhwa");
    expect(row.origin).toBe("KR");
  });
});

describe("useWhitelistFilters — type filter must keep matching rows", () => {
  function item(over: Partial<WhitelistRouteItem>): WhitelistRouteItem {
    return {
      id: "k",
      title: "T",
      cover: null,
      source: "shinigami",
      ...over,
    } as WhitelistRouteItem;
  }

  it("returns the manhwa row when typeFilter is manhwa", () => {
    const items = [
      item({ id: "a", title: "A", type: "manhwa" }),
      item({ id: "b", title: "B", type: "manhua" }),
    ];
    const { result } = renderHook(() =>
      useWhitelistFilters(items, {
        sourceFilter: "All",
        typeFilter: "manhwa",
        debouncedSearch: "",
        sort: "title",
      })
    );
    expect(result.current.map((i) => i.id)).toEqual(["a"]);
  });

  it("returns the manhua row when typeFilter is manhua", () => {
    const items = [
      item({ id: "a", title: "A", type: "manhwa" }),
      item({ id: "b", title: "B", type: "manhua" }),
    ];
    const { result } = renderHook(() =>
      useWhitelistFilters(items, {
        sourceFilter: "All",
        typeFilter: "manhua",
        debouncedSearch: "",
        sort: "title",
      })
    );
    expect(result.current.map((i) => i.id)).toEqual(["b"]);
  });
});
