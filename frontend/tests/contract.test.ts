import { describe, it, expect } from "vitest";
import { rssItemSchema } from "@/lib/schemas";
import backendSample from "./fixtures/rss-backend-sample.json";

/**
 * Contract test: nothing the backend sends may be silently dropped on the way
 * to the browser.
 *
 * Why this exists — rssItemSchema re-parses every row through
 * baseRssItemSchema, and Zod strips any key an object schema does not
 * declare. The backend was sending `format`, `country`, `latestUpdated` and
 * `sources`; none were declared, so all four vanished at the proxy boundary
 * with no error anywhere. The symptom was a country flag that never rendered
 * even though three separate components were fixed to look for it.
 *
 * The fixture is a captured GET /api/v1/rss response. Refreshing it is
 * deliberate — run the capture when the backend payload changes, then let this
 * test tell you which new field needs declaring.
 */
describe("backend -> schema contract", () => {
  const results = (backendSample as { data?: { results?: unknown[] } }).data?.results ?? [];

  it("the fixture actually contains backend rows", () => {
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("survives a schema round trip without throwing", () => {
    for (const row of results) {
      expect(rssItemSchema.safeParse(row).success).toBe(true);
    }
  });

  /**
   * `chapters` is intentionally absent from the schema: the grouped code path
   * in app/api/v1/rss/route.ts bypasses the schema for grouped responses so
   * the nested array survives. Everything else must round trip.
   */
  const DELIBERATELY_STRIPPED = new Set(["chapters"]);

  it("no field the backend sends is silently dropped", () => {
    const dropped = new Set<string>();

    for (const row of results) {
      const input = row as Record<string, unknown>;
      const parsed = rssItemSchema.safeParse(input);
      if (!parsed.success) continue;
      const out = parsed.data as Record<string, unknown>;

      for (const key of Object.keys(input)) {
        if (DELIBERATELY_STRIPPED.has(key)) continue;
        if (!(key in out)) dropped.add(key);
      }
    }

    expect(
      [...dropped].sort(),
      `these backend fields are not declared in baseRssItemSchema and are being stripped — add them to packages/shared/src/schemas.ts`,
    ).toEqual([]);
  });

  it("keeps the fields the cards depend on", () => {
    // Spelled out rather than derived, so deleting one of these from the
    // schema fails here instead of silently blanking a card.
    for (const row of results) {
      const out = rssItemSchema.parse(row) as Record<string, unknown>;
      for (const key of ["format", "country", "latestUpdated", "sources", "title", "cover"]) {
        expect(key in out, `${key} missing from parsed row`).toBe(true);
      }
    }
  });
});
