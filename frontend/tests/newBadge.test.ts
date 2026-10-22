import { describe, it, expect } from "vitest";
import { seriesHasNewSince, seriesHasNewWithin } from "@/lib/groupChapters";

/**
 * "New since your last visit" is what drives the red Baru badge.
 *
 * The cutoff is the timestamp the navbar stores in `rss:lastSeen` when
 * /recent opens, so a series counts as new only if a chapter arrived after
 * that moment — not merely today. That is why seriesHasNewSince takes a
 * cutoff instead of an hour count; seriesHasNewWithin is the rolling-window
 * wrapper kept for callers that genuinely want one.
 */

const HOUR = 3600_000;
const NOW = Date.now();

function series(chapterAgesHours: number[], sentAtOverride?: string) {
  return {
    title: "T",
    titleKey: "t",
    cover: "",
    origin: "",
    seriesUrl: "https://example.com/s",
    isWhitelisted: false,
    chapters: chapterAgesHours.map((age, i) => ({
      key: `c${i}`,
      source: "shinigami",
      chapter: String(i + 1),
      chapterLabel: `Ch. ${i + 1}`,
      chapterNumber: i + 1,
      url: `u${i}`,
      chapterUrl: `u${i}`,
      sentAt: sentAtOverride ?? new Date(NOW - age * HOUR).toISOString(),
    })),
  } as never;
}

describe("seriesHasNewSince", () => {
  it("counts a chapter released after the last visit", () => {
    expect(seriesHasNewSince(series([1]), NOW - 2 * HOUR)).toBe(true);
  });

  it("ignores a chapter that predates the last visit", () => {
    expect(seriesHasNewSince(series([2]), NOW - 1 * HOUR)).toBe(false);
  });

  it("counts a chapter released minutes ago", () => {
    expect(seriesHasNewSince(series([0.02]), NOW - 1 * HOUR)).toBe(true);
  });

  it("ignores old chapters", () => {
    expect(seriesHasNewSince(series([72]), NOW - 1 * HOUR)).toBe(false);
  });

  it("ignores an unparseable sentAt instead of treating it as new", () => {
    expect(seriesHasNewSince(series([0], "bukan tanggal"), NOW - 1 * HOUR)).toBe(false);
  });

  it("needs only one new chapter out of many", () => {
    expect(seriesHasNewSince(series([50, 0.5, 80]), NOW - 1 * HOUR)).toBe(true);
  });
});

describe("seriesHasNewWithin", () => {
  it("uses a rolling window when no cutoff is available", () => {
    expect(seriesHasNewWithin(series([1]), 24)).toBe(true);
    expect(seriesHasNewWithin(series([48]), 24)).toBe(false);
  });
});
