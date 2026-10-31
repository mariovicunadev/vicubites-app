import { describe, expect, it } from "vitest";

import { formatCount } from "./format";

describe("formatCount", () => {
  it("formats exact counts with thousands separators", () => {
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(0)).toBe("0");
  });

  it("marks AT_LEAST counts as a lower bound", () => {
    expect(formatCount(10000, "AT_LEAST")).toBe("10,000+");
  });
});
