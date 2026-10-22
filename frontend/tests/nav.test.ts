import { describe, it, expect } from "vitest";
import { isNavActive } from "@/lib/nav";

describe("isNavActive (sidebar nav state)", () => {
  it("exact match for root", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/", "/recent")).toBe(false);
  });

  it("'/whitelist' is EXACT — child '/whitelist/chapters' must NOT light it up", () => {
    expect(isNavActive("/whitelist", "/whitelist")).toBe(true);
    // Regression: previously this returned true (startsWith), highlighting
    // both Whitelist + Chapters. Must be false.
    expect(isNavActive("/whitelist", "/whitelist/chapters")).toBe(false);
  });

  it("other items match by prefix", () => {
    expect(isNavActive("/recent", "/recent")).toBe(true);
    expect(isNavActive("/recent", "/recent?page=2")).toBe(true);
    expect(isNavActive("/status", "/status/incidents")).toBe(true);
  });
});
