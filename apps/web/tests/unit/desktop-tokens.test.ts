import { describe, expect, it } from "vitest";
import {
  formatUserCode,
  generateOpaqueToken,
  hashOpaqueToken,
  normalizeUserCode,
} from "@/server/desktop/tokens";

describe("desktop token helpers", () => {
  it("normalizes user codes consistently", () => {
    expect(normalizeUserCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(formatUserCode("abcd efgh")).toBe("ABCD-EFGH");
  });

  it("generates opaque tokens and stable hashes", () => {
    const token = generateOpaqueToken();
    expect(token.length).toBeGreaterThan(20);
    expect(hashOpaqueToken(token)).toHaveLength(64);
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });
});
