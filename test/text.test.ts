import { describe, expect, it } from "vitest";
import {
  fcfsKey,
  normalizeChapter,
  normalizeTitleKey,
  slugifyTitleKey,
  deslugifyTitleKey,
  parseIkiruTs,
  stripHtml,
} from "../src/utils/text";

/**
 * Parity tests.
 *
 * These pin the exact behaviour of the Python implementation
 * (app/utils/text.py + app/services/fcfs.py). If any of these change, the
 * whitelist match or the cross-source dedupe silently changes with them —
 * notifications would stop or double rather than error.
 */

describe("normalizeTitleKey", () => {
  it("lowercases and collapses non-alphanumerics to single spaces", () => {
    expect(normalizeTitleKey("Bizarre  Restaurant!")).toBe("bizarre restaurant");
    expect(normalizeTitleKey("A  -  B")).toBe("a b");
    expect(normalizeTitleKey("Solo Leveling: Ragnarok")).toBe("solo leveling ragnarok");
  });

  it("handles unicode and punctuation the way Python's re.sub does", () => {
    expect(normalizeTitleKey("I'm the Max-Level Newbie")).toBe("i m the max level newbie");
    expect(normalizeTitleKey("The Knight's Return")).toBe("the knight s return");
  });

  it("decodes HTML entities first", () => {
    expect(normalizeTitleKey("I&#8217;m a Genius")).toBe("i m a genius");
    expect(normalizeTitleKey("A &amp; B")).toBe("a b");
    expect(normalizeTitleKey("&quot;Quoted&quot;")).toBe("quoted");
  });

  it("returns empty for empty input", () => {
    expect(normalizeTitleKey("")).toBe("");
    expect(normalizeTitleKey(null)).toBe("");
    expect(normalizeTitleKey(undefined)).toBe("");
  });
});

describe("slugifyTitleKey", () => {
  it("replaces spaces with dashes", () => {
    expect(slugifyTitleKey("Bizarre Restaurant")).toBe("bizarre-restaurant");
    expect(slugifyTitleKey("The Story of Becoming a Married Man")).toBe(
      "the-story-of-becoming-a-married-man",
    );
  });

  it("round-trips through deslugify", () => {
    const slug = slugifyTitleKey("Eternally Regressing Knight");
    expect(slug).toBe("eternally-regressing-knight");
    expect(deslugifyTitleKey(slug)).toBe("eternally regressing knight");
  });

  it("never produces a leading or trailing dash", () => {
    expect(slugifyTitleKey("  !!!Hello!!!  ")).toBe("hello");
  });
});

describe("normalizeChapter", () => {
  it("strips trailing zeros from decimals", () => {
    expect(normalizeChapter("12.50")).toBe("12.5");
    expect(normalizeChapter("12.00")).toBe("12");
    expect(normalizeChapter("1.0")).toBe("1");
  });

  it("maps hyphen splits onto dots", () => {
    // This is what makes "160-2" and "160.2" the same chapter.
    expect(normalizeChapter("160-2")).toBe("160.2");
    expect(normalizeChapter("160.2")).toBe("160.2");
  });

  it("strips leading zeros", () => {
    expect(normalizeChapter("012")).toBe("12");
    expect(normalizeChapter("007.5")).toBe("7.5");
  });

  it("preserves non-numeric labels verbatim, including case", () => {
    expect(normalizeChapter("OVA")).toBe("OVA");
    expect(normalizeChapter("Extra")).toBe("Extra");
  });

  it("accepts numbers as well as strings", () => {
    expect(normalizeChapter(12)).toBe("12");
    expect(normalizeChapter(12.5)).toBe("12.5");
  });
});

describe("fcfsKey", () => {
  it("is source-agnostic: same title+chapter -> same key", () => {
    const a = fcfsKey("Solo Leveling", "120");
    const b = fcfsKey("Solo Leveling", "120");
    expect(a).toBe(b);
  });

  it("normalises both halves", () => {
    expect(fcfsKey("Solo  Leveling!", "012.50")).toBe("solo-leveling|12.5");
  });

  it("treats hyphen and dot chapter splits as identical", () => {
    expect(fcfsKey("X", "160-2")).toBe(fcfsKey("X", "160.2"));
  });

  it("differs when the chapter differs", () => {
    expect(fcfsKey("X", "1")).not.toBe(fcfsKey("X", "2"));
  });
});

describe("parseIkiruTs", () => {
  it("shifts WIB-labelled-as-UTC back by 7 hours", () => {
    // 2026-10-06T23:00:00Z is really 16:00 UTC.
    const ms = parseIkiruTs("2026-10-06T23:00:00.000Z");
    expect(ms).not.toBeNull();
    expect(new Date(ms as number).toISOString()).toBe("2026-10-06T16:00:00.000Z");
  });

  it("returns null on garbage rather than throwing", () => {
    expect(parseIkiruTs("")).toBeNull();
    expect(parseIkiruTs(null)).toBeNull();
    expect(parseIkiruTs("not-a-date")).toBeNull();
  });
});

describe("stripHtml", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtml("<p>Hello   <b>world</b></p>")).toBe("Hello world");
  });

  it("decodes entities", () => {
    expect(stripHtml("A &amp; B &lt;tag&gt;")).toBe("A & B <tag>");
  });
});
