import { describe, it, expect } from "vitest";
import { rssItemSchema } from "@/lib/schemas";

describe("rssItemSchema", () => {
  it("normalizes snake_case fields to camelCase", () => {
    const out = rssItemSchema.parse({
      title: "Solo Leveling",
      title_key: "solo-leveling",
      chapter_label: "Ch. 12",
      chapter_number: "12",
      chapter_url: "https://a/b",
      series_url: "https://a/series",
      canonical_title_key: "solo-leveling",
      is_sent: true,
    });
    expect(out.titleKey).toBe("solo-leveling");
    expect(out.chapterLabel).toBe("Ch. 12");
    expect(out.chapterNumber).toBe(12);
    expect(out.chapterUrl).toBe("https://a/b");
    expect(out.seriesUrl).toBe("https://a/series");
    expect(out.canonicalTitleKey).toBe("solo-leveling");
    expect(out.isSent).toBe(true);
  });

  it("keeps camelCase fields when already present", () => {
    const out = rssItemSchema.parse({
      title: "T",
      titleKey: "t-key",
      chapterLabel: "Ch. 3",
      chapterNumber: 3,
      url: "https://a/3",
      seriesUrl: "https://a/s",
      isSent: false,
    });
    expect(out.titleKey).toBe("t-key");
    expect(out.chapterLabel).toBe("Ch. 3");
    expect(out.chapterNumber).toBe(3);
    expect(out.url).toBe("https://a/3");
    expect(out.seriesUrl).toBe("https://a/s");
    expect(out.isSent).toBe(false);
  });

  it("falls back url to chapterUrl when url is missing", () => {
    const out = rssItemSchema.parse({
      title: "T",
      chapterUrl: "https://a/ch",
      seriesUrl: "https://a/s",
    });
    expect(out.url).toBe("https://a/ch");
  });

  it("keeps chapter_number null as null (not 0)", () => {
    const out = rssItemSchema.parse({ title: "T", chapter_number: null });
    expect(out.chapterNumber).toBeNull();
  });

  it("coerces is_sent number to boolean", () => {
    expect(rssItemSchema.parse({ title: "T", is_sent: 1 }).isSent).toBe(true);
    expect(rssItemSchema.parse({ title: "T", is_sent: 0 }).isSent).toBe(false);
  });

  it("coerces is_whitelisted to boolean", () => {
    expect(
      rssItemSchema.parse({ title: "T", is_whitelisted: 1 }).isWhitelisted
    ).toBe(true);
  });

  it("rewrites external covers through the image proxy", () => {
    const out = rssItemSchema.parse({
      title: "T",
      cover:
        "https://scanner.aldifhr.my.id/api/v1/reader/proxy?url=https%3A%2F%2Fimg.example.com%2Fcover.jpg",
    });
    expect(out.cover).toContain("/api/v1/reader/proxy?url=");
    expect(out.cover).not.toContain("scanner.aldifhr.my.id");
  });

  it("does not throw on missing/empty fields", () => {
    const out = rssItemSchema.parse({ title: "T" });
    expect(out.title).toBe("T");
    expect(out.chapterNumber).toBeUndefined();
    expect(out.isSent).toBeUndefined();
    expect(out.isWhitelisted).toBeUndefined();
    expect(out.url).toBeUndefined();
  });

  it("coerces malformed chapter strings without throwing", () => {
    const out = rssItemSchema.parse({
      title: "T",
      chapter_number: "N/A",
      genres: null,
      rating: "8.5",
    });
    expect(out.chapterNumber).toBeUndefined();
    expect(out.genres).toEqual([]);
    expect(out.rating).toBe("8.5");
  });
});
