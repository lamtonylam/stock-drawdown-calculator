import { describe, expect, it } from "vitest";
import { daysBeforeAsOf, period1ForRange } from "./ranges";

describe("daysBeforeAsOf", () => {
  it("steps back across a year boundary", () => {
    expect(daysBeforeAsOf("2009-01-01", 1)).toBe("2008-12-31");
  });

  it("handles leap days", () => {
    expect(daysBeforeAsOf("2008-03-01", 1)).toBe("2008-02-29");
  });

  it("goes back a full 1Y window from a 2008 crash date", () => {
    const start = daysBeforeAsOf("2008-09-15", 365);
    expect(start < "2008-09-15").toBe(true);
    expect(start).toBe("2007-09-16"); // 366-day leap span, minus 365
  });
});

describe("period1ForRange", () => {
  it("anchors the window at the backtest date, not today", () => {
    expect(period1ForRange("1Y", "2008-09-15")).toBe("2007-09-16");
    expect(period1ForRange("3Y", "2008-09-15")).toBe(
      daysBeforeAsOf("2008-09-15", 1095)
    );
    // Window start must precede the backtest end, or Yahoo rejects it.
    for (const range of ["1Y", "3Y", "5Y"] as const) {
      expect(period1ForRange(range, "2008-09-15") < "2008-09-15").toBe(true);
    }
  });

  it("keeps MAX open-ended back to 1970 when backtesting", () => {
    expect(period1ForRange("MAX", "2008-09-15")).toBe("1970-01-01");
  });

  it("keeps live mode anchored at today", () => {
    for (const range of ["1Y", "3Y", "5Y", "MAX"] as const) {
      expect(period1ForRange(range, null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
