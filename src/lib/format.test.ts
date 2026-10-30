import { describe, expect, it } from "vitest";
import { fmtDate, fmtDays, fmtPct, fmtPrice } from "./format";

describe("format helpers", () => {
  it("formats percentages", () => {
    expect(fmtPct(-0.09489)).toBe("-9.49%");
    expect(fmtPct(0)).toBe("0.00%");
  });

  it("formats prices", () => {
    expect(fmtPrice(6850, "USD")).toContain("6,850");
    expect(fmtPrice(6200.5)).toContain("6,200");
  });

  it("formats ISO dates in UTC", () => {
    expect(fmtDate("2025-02-19")).toContain("2025");
    expect(fmtDate("2025-02-19")).toContain("Feb");
  });

  it("degrades instead of rendering 'Invalid Date'", () => {
    expect(fmtDate("not-a-date")).toBe("not-a-date");
    expect(fmtDate("")).toBe("");
  });

  it("formats day counts", () => {
    expect(fmtDays(null)).toBe("—");
    expect(fmtDays(0)).toBe("0 days");
    expect(fmtDays(1)).toBe("1 day");
    expect(fmtDays(271)).toBe("271 days");
  });
});
