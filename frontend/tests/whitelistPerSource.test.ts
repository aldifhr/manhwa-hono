import { describe, expect, it } from "vitest";
import { groupChapters } from "@/lib/groupChapters";
import type { FlatChapter } from "@/lib/feed";

/**
 * Regression tests for the "already Verified even though I never added it" bug.
 *
 * A series carried by two sources is grouped into ONE card. The card used to
 * set a single group-wide `isWhitelisted` flag, and the card renders EITHER a
 * "Verified" badge OR an "Add WL" button — never both. So as soon as one source
 * was whitelisted, the badge appeared and the Add button disappeared for the
 * other source, leaving that source unreachable: there was no way to subscribe
 * it from the feed at all.
 *
 * The fix keeps `isWhitelisted` as a group-wide OR (filters and counters read
 * it) but adds `whitelistedSources`, which is per source. The card uses that to
 * decide which source still needs an Add button.
 */

function ch(over: Partial<FlatChapter> & { source: string; isWhitelisted: boolean }): FlatChapter {
  return {
    title: "Overlord of Insects",
    titleKey: "overlord-of-insects",
    chapter: "112",
    chapterLabel: "Chapter 112",
    chapterNumber: 112,
    url: `https://example.com/${over.source}/112`,
    chapterUrl: `https://example.com/${over.source}/112`,
    seriesUrl: `https://example.com/${over.source}`,
    sentAt: "2026-10-06T16:00:00.000Z",
    createdAt: "2026-10-06T16:00:00.000Z",
    cover: "",
    origin: "KR",
    type: "manhwa",
    ...over,
  } as FlatChapter;
}

describe("groupChapters — per-source whitelist state", () => {
  it("records the whitelisted source separately from the rest", () => {
    const grouped = groupChapters([
      ch({ source: "shinigami", isWhitelisted: true }),
      ch({ source: "voratoon", isWhitelisted: false }),
    ]);

    expect(grouped).toHaveLength(1);
    const g = grouped[0]!;
    expect(g.sources.sort()).toEqual(["shinigami", "voratoon"]);
    expect(g.whitelistedSources).toEqual(["shinigami"]);
    // Group-wide flag stays true — filters and counters depend on it.
    expect(g.isWhitelisted).toBe(true);
  });

  it("leaves the non-whitelisted source addable", () => {
    // This is the actual bug: the card must still offer Add for voratoon.
    const g = groupChapters([
      ch({ source: "shinigami", isWhitelisted: true }),
      ch({ source: "voratoon", isWhitelisted: false }),
    ])[0]!;

    const addable = g.sources.filter((s) => !g.whitelistedSources.includes(s));
    expect(addable).toEqual(["voratoon"]);
  });

  it("lists both sources when both are whitelisted", () => {
    const g = groupChapters([
      ch({ source: "shinigami", isWhitelisted: true }),
      ch({ source: "voratoon", isWhitelisted: true }),
    ])[0]!;

    expect(g.whitelistedSources.sort()).toEqual(["shinigami", "voratoon"]);
    expect(g.sources.filter((s) => !g.whitelistedSources.includes(s))).toEqual([]);
  });

  it("lists no whitelisted source when none is subscribed", () => {
    const g = groupChapters([
      ch({ source: "shinigami", isWhitelisted: false }),
      ch({ source: "voratoon", isWhitelisted: false }),
    ])[0]!;

    expect(g.isWhitelisted).toBe(false);
    expect(g.whitelistedSources).toEqual([]);
    expect(g.sources.sort()).toEqual(["shinigami", "voratoon"]);
  });

  it("does not duplicate a source that appears in several chapters", () => {
    const g = groupChapters([
      ch({ source: "voratoon", isWhitelisted: true, chapter: "1", chapterNumber: 1 }),
      ch({ source: "voratoon", isWhitelisted: true, chapter: "2", chapterNumber: 2 }),
    ])[0]!;

    expect(g.sources).toEqual(["voratoon"]);
    expect(g.whitelistedSources).toEqual(["voratoon"]);
  });

  it("handles a source that only appears on a non-whitelisted chapter", () => {
    // shinigami whitelisted on ch 1, voratoon only on ch 2 and not whitelisted.
    const g = groupChapters([
      ch({ source: "shinigami", isWhitelisted: true, chapter: "1", chapterNumber: 1 }),
      ch({ source: "voratoon", isWhitelisted: false, chapter: "2", chapterNumber: 2 }),
    ])[0]!;

    expect(g.whitelistedSources).toEqual(["shinigami"]);
    expect(g.sources.filter((s) => !g.whitelistedSources.includes(s))).toEqual(["voratoon"]);
  });

  it("is order-independent: a whitelisted source is recorded even when it is not first", () => {
    // The feed's order is by recency, so the whitelisted source can arrive
    // second. A group-wide-only flag would lose which source was subscribed,
    // and the card would then offer Add for a source that is already added.
    const g = groupChapters([
      ch({ source: "voratoon", isWhitelisted: false, chapter: "2", chapterNumber: 2 }),
      ch({ source: "shinigami", isWhitelisted: true, chapter: "1", chapterNumber: 1 }),
    ])[0]!;

    expect(g.whitelistedSources).toEqual(["shinigami"]);
    expect(g.sources.filter((s) => !g.whitelistedSources.includes(s))).toEqual(["voratoon"]);
    expect(g.isWhitelisted).toBe(true);
  });
});
