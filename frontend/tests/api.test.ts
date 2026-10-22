import { describe, it, expect, vi, afterEach } from "vitest";
import { Reader } from "@/lib/reader";
const getRssFeedFlatPage = (p: number, l = 1000, ...a: unknown[]) =>
  Reader.getRssFlatPage(p, l) as Promise<{
    hasMore: boolean;
    total: number;
    totalPages: number;
  }>;
const countNewSince = (ts: number, opts?: unknown) =>
  Reader.countNewSince(ts, opts as never);

// Mock the global fetch used by fetchJson inside lib/api.
function mockFetchOnce(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    }))
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("countNewSince", () => {
  it("uses the backend /rss/new endpoint when available", async () => {
    const fetchMock = vi.fn(async (_url: unknown) => ({
      ok: true,
      json: async () => ({ success: true, data: { newCount: 7 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const lastSeen = new Date("2026-08-04T00:00:00Z").getTime();
    expect(await countNewSince(lastSeen)).toBe(7);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/api/v1/rss/new?since=");
    expect(calledUrl).toContain("distinct=title");
  });

  it("throws when backend returns no newCount", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      }))
    );
    const lastSeen = new Date("2026-08-04T00:00:00Z").getTime();
    await expect(countNewSince(lastSeen)).rejects.toThrow();
  });
});

describe("getRssFeedFlatPage", () => {
  it("derives hasMore from totalPages (infinite scroll loads next page)", async () => {
    mockFetchOnce({
      success: true,
      data: {
        results: [{ titleKey: "a", source: "shinigami", chapter: "1" }],
        total: 48,
        page: 1,
        pageSize: 24,
        totalPages: 2,
      },
    });
    const page = await getRssFeedFlatPage(1, 24);
    expect(page.hasMore).toBe(true); // page 1 of 2 → more
    expect(page.total).toBe(48);
    expect(page.totalPages).toBe(2);
  });

  it("hasMore false on last page", async () => {
    mockFetchOnce({
      success: true,
      data: {
        results: [],
        total: 24,
        page: 2,
        pageSize: 24,
        totalPages: 2,
      },
    });
    const page = await getRssFeedFlatPage(2, 24);
    expect(page.hasMore).toBe(false); // page 2 of 2 → no more
  });

  it("empty results → hasMore false, total 0", async () => {
    mockFetchOnce({
      success: true,
      data: { results: [], total: 0, page: 1, pageSize: 24, totalPages: 1 },
    });
    const page = await getRssFeedFlatPage(1, 24);
    expect(page.hasMore).toBe(false);
    expect(page.total).toBe(0);
  });
});
