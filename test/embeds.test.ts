import { describe, expect, it } from "vitest";
import { buildEmbed, colorFor, labelFor } from "../src/discord/embeds";
import { SOURCE_COLORS } from "../src/config";

/**
 * Embed parity tests.
 *
 * The colours are load-bearing: the operator specified shinigami red,
 * voratoon orange, and the frontend uses the same palette.
 */
describe("source colours", () => {
  it("matches the agreed palette", () => {
    expect(colorFor("shinigami")).toBe(0xef4444); // red
    expect(colorFor("voratoon")).toBe(0xf97316); // orange
  });

  it("falls back to grey for an unknown source", () => {
    expect(colorFor("nope")).toBe(0x95a5a6);
  });

  it("exposes the palette so the frontend can be kept in sync", () => {
    expect(SOURCE_COLORS.shinigami).toBe(0xef4444);
    expect(SOURCE_COLORS.voratoon).toBe(0xf97316);
  });
});

describe("labels", () => {
  it("uses the display name", () => {
    expect(labelFor("shinigami")).toBe("Shinigami");
    expect(labelFor("voratoon")).toBe("Voratoon");
  });
});

describe("buildEmbed", () => {
  const base = {
    title: "Solo Leveling",
    chapters: ["120"],
    chapterUrls: ["https://example.com/ch-120"],
    seriesUrl: "https://example.com/series/solo",
    source: "voratoon",
    cover: "https://cdn.example.com/cover.jpg",
    rating: 8.5,
    genres: ["Action", "Fantasy"],
    description: "A hunter awakens.",
    updatedTime: "2026-10-06T16:00:00.000Z",
  };

  it("sets the colour from the source", () => {
    expect(buildEmbed(base).color).toBe(0xf97316);
  });

  it("links a single chapter", () => {
    const embed = buildEmbed(base);
    const fields = embed.fields as Array<{ name: string; value: string }>;
    const chapterField = fields.find((f) => f.name.startsWith("📖"));
    expect(chapterField?.name).toBe("📖 Chapter");
    expect(chapterField?.value).toContain("[ch 120]");
  });

  it("lists every chapter and pluralises when there is more than one", () => {
    const embed = buildEmbed({
      ...base,
      chapters: ["120", "121", "122"],
      chapterUrls: ["u120", "u121", "u122"],
    });
    const fields = embed.fields as Array<{ name: string; value: string }>;
    const chapterField = fields.find((f) => f.name.startsWith("📖"));
    expect(chapterField?.name).toBe("📖 Chapters");
    expect(chapterField?.value).toContain("ch 120");
    expect(chapterField?.value).toContain("ch 121");
    expect(chapterField?.value).toContain("ch 122");
  });

  it("sorts chapters numerically, not lexicographically", () => {
    const embed = buildEmbed({
      ...base,
      chapters: ["9", "10", "100"],
      chapterUrls: ["u9", "u10", "u100"],
    });
    const fields = embed.fields as Array<{ name: string; value: string }>;
    const value = fields.find((f) => f.name.startsWith("📖"))?.value ?? "";
    // 9 must come before 10, which must come before 100.
    expect(value.indexOf("ch 9")).toBeLessThan(value.indexOf("ch 10"));
    expect(value.indexOf("ch 10")).toBeLessThan(value.indexOf("ch 100"));
  });

  it("renders the source as a label, not the raw key", () => {
    const embed = buildEmbed(base);
    const fields = embed.fields as Array<{ name: string; value: string }>;
    expect(fields.find((f) => f.name === "🔗 Source")?.value).toBe("`Voratoon`");
  });

  it("includes a thumbnail only when a cover exists", () => {
    expect(buildEmbed(base).thumbnail).toEqual({ url: base.cover });
    expect(buildEmbed({ ...base, cover: null }).thumbnail).toBeUndefined();
  });

  it("shows 'No rating' when the rating is missing", () => {
    const embed = buildEmbed({ ...base, rating: null });
    const fields = embed.fields as Array<{ name: string; value: string }>;
    expect(fields.find((f) => f.name === "⭐ Rating")?.value).toBe("`No rating`");
  });

  it("escapes markdown so a title cannot break the embed", () => {
    const embed = buildEmbed({ ...base, title: "A *Bold* Attempt" });
    expect(embed.title).toBe("A *Bold* Attempt");
  });

  it("truncates an over-long title", () => {
    const embed = buildEmbed({ ...base, title: "x".repeat(300) });
    expect(String(embed.title).length).toBeLessThanOrEqual(200);
  });
});
