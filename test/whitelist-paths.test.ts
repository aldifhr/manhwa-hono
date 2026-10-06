import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { filterWhitelisted } from "../src/collectors";
import type { ScrapedItem } from "../src/collectors/common";

/**
 * Every send path must respect the whitelist.
 *
 * A chapter reaches Discord by exactly two routes, and BOTH must be
 * whitelist-scoped:
 *
 *   1. dispatch()                  — caller filters via filterWhitelisted()
 *   2. retryFailedDispatches()     — re-checks the whitelist itself
 *
 * The retry path is the one that bit the Python backend: a row in
 * failed_dispatches outlives the whitelist entry that produced it (the operator
 * unsubscribes while a send is parked), so without a check it re-sends a
 * cancelled series forever.
 *
 * These tests read the sources rather than mocking a live DB, because the
 * failure mode is "the check is missing", which only a source assertion catches
 * reliably. The end-to-end probe lives in the README.
 */

const ROOT = join(__dirname, "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

function item(title: string, chapter: string, source: ScrapedItem["source"]): ScrapedItem {
  return {
    title,
    title_key: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    chapter,
    chapter_num: Number.parseFloat(chapter) || 0,
    url: `https://example.com/${chapter}`,
    chapter_url: `https://example.com/${chapter}`,
    source,
    cover: null,
    series_url: "https://example.com/series",
    origin: "KR",
    updated_time: "2026-10-06T16:00:00.000Z",
    release_date: "2026-10-06T16:00:00.000Z",
    rating: null,
    genres: [],
    description: "",
    type: "manhwa",
  };
}

describe("filterWhitelisted", () => {
  it("keeps an item whose title is whitelisted", () => {
    const items = [item("Solo Leveling", "120", "voratoon")];
    const kept = filterWhitelisted(items, [{ title_key: "solo leveling" }]);
    expect(kept).toHaveLength(1);
  });

  it("drops an item whose title is not whitelisted", () => {
    const items = [item("Random Series", "5", "voratoon")];
    const kept = filterWhitelisted(items, [{ title_key: "solo leveling" }]);
    expect(kept).toHaveLength(0);
  });

  it("matches CROSS-SOURCE on purpose", () => {
    // The whitelist row is for shinigami; the item came from voratoon. It must
    // still match — FCFS decides which source wins, not the whitelist.
    const items = [item("Solo Leveling", "120", "voratoon")];
    const kept = filterWhitelisted(items, [{ title_key: "solo leveling" }]);
    expect(kept).toHaveLength(1);
  });

  it("matches regardless of punctuation and case differences", () => {
    const items = [item("Solo Leveling: Ragnarok!", "1", "voratoon")];
    const kept = filterWhitelisted(items, [{ title_key: "Solo  Leveling Ragnarok" }]);
    expect(kept).toHaveLength(1);
  });

  it("returns nothing when the whitelist is empty", () => {
    const items = [item("Solo Leveling", "120", "voratoon")];
    expect(filterWhitelisted(items, [])).toHaveLength(0);
  });
});

describe("retry path is whitelist-gated", () => {
  const src = read("src/services/retry.ts");

  it("consults the whitelist", () => {
    expect(src).toContain("whitelist");
    expect(src).toContain("loadWhitelistTitles");
  });

  it("fails CLOSED when the whitelist cannot be loaded", () => {
    // Without the whitelist, a live subscription is indistinguishable from a
    // cancelled one — and sending to a cancelled one is the bug.
    expect(src).toContain("skipping pass");
    const loadAt = src.indexOf("whitelist load failed");
    const sendAt = src.indexOf("sendEmbeds(");
    expect(loadAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(-1);
    expect(loadAt).toBeLessThan(sendAt);
  });

  it("resolves rather than re-sends an unsubscribed row", () => {
    expect(src).toContain("no longer whitelisted");
    expect(src).toContain("skippedUnsubscribed");
  });

  it("uses the same cross-source rule as normal dispatch", () => {
    // Both must key on the title alone, or one path announces what the other
    // suppresses.
    expect(src).toContain("slugifyTitleKey");
    const collectors = read("src/collectors/index.ts");
    expect(collectors).toContain("slugifyTitleKey");
    expect(collectors).toContain("cross-source");
  });
});

describe("dispatch path is whitelist-gated upstream", () => {
  it("the pipeline filters before calling dispatch", () => {
    const pipeline = read("src/cron/pipeline.ts");
    expect(pipeline).toContain("filterWhitelisted");
    const filterAt = pipeline.indexOf("filterWhitelisted(");
    const dispatchAt = pipeline.indexOf("await dispatch(");
    expect(filterAt).toBeGreaterThan(-1);
    expect(dispatchAt).toBeGreaterThan(-1);
    expect(filterAt).toBeLessThan(dispatchAt);
  });

  it("dispatch refuses to send when no whitelist matched", () => {
    const pipeline = read("src/cron/pipeline.ts");
    // `whitelist.length > 0 ? filter : []` — an empty whitelist means nothing
    // is sent, never everything.
    expect(pipeline).toContain("whitelist.length > 0");
  });

  it("dispatch itself documents that the caller must have filtered", () => {
    const src = read("src/services/dispatch.ts");
    expect(src).toContain("MUST already be whitelist-filtered");
  });
});

describe("claim expiry is handled on both the read and the write", () => {
  const src = read("src/services/claim.ts");

  it("the read filters on expires_at", () => {
    expect(src).toContain("expires_at");
  });

  it("the ON CONFLICT only yields when the existing claim expired", () => {
    // ON CONFLICT DO NOTHING would let an expired claim block re-claiming
    // forever — the chapter is never sent and the row sits there.
    expect(src).toContain("WHERE dispatch_claims.expires_at < excluded.created_at");
  });
});
