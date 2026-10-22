import { describe, it, expect } from "vitest";
import { normalizeOrigin, getOriginFlag } from "@/lib/constants";

describe("normalizeOrigin", () => {
  it("country codes → canonical names", () => {
    expect(normalizeOrigin("KR")).toBe("korean");
    expect(normalizeOrigin("JP")).toBe("japanese");
    expect(normalizeOrigin("CN")).toBe("chinese");
  });
  it("source slugs also map", () => {
    expect(normalizeOrigin("manhwa")).toBe("korean");
    expect(normalizeOrigin("manga")).toBe("japanese");
    expect(normalizeOrigin("manhua")).toBe("chinese");
  });
  it("empty / unknown passes through lowercased", () => {
    expect(normalizeOrigin("")).toBe("");
    expect(normalizeOrigin("korea")).toBe("korea");
  });
});

describe("getOriginFlag", () => {
  it("maps to flag asset paths", () => {
    expect(getOriginFlag("korean")).toBe("/kr.png");
    expect(getOriginFlag("japanese")).toBe("/jp.png");
    expect(getOriginFlag("chinese")).toBe("/cn.png");
  });
  it("empty → empty", () => {
    expect(getOriginFlag("")).toBe("");
  });
});
