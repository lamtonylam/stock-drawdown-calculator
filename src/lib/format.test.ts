import { describe, expect, it } from "vitest";
import {
  atHighTitle,
  fmtDate,
  fmtDays,
  fmtPct,
  fmtPrice,
  fmtTradingSessions,
} from "./format";

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
    expect(fmtDays(364)).toBe("364 days");
  });

  it("formats long spans as years", () => {
    expect(fmtDays(365)).toBe("1 year");
    expect(fmtDays(400)).toBe("1.1 years");
    expect(fmtDays(730)).toBe("2 years");
    expect(fmtDays(5000)).toContain("year");
  });

  it("formats trading sessions with year hint", () => {
    expect(fmtTradingSessions(null)).toBe("—");
    expect(fmtTradingSessions(100)).toBe("100 sessions");
    expect(fmtTradingSessions(500)).toContain("sessions");
    expect(fmtTradingSessions(500)).toContain("y)");
  });
});

describe("atHighTitle", () => {
  it("only says 'all-time' for the MAX range", () => {
    expect(atHighTitle("^GSPC", "MAX")).toBe("^GSPC is at an all-time high");
  });

  it("scopes the claim to the window for 1Y/3Y/5Y", () => {
    // `isAtHigh` compares against the peak *inside the range*, so a 1Y window
    // that tops out below the real record must not claim a record.
    for (const range of ["1Y", "3Y", "5Y"]) {
      const title = atHighTitle("NVDA", range);
      expect(title).toBe(`NVDA is at its highest close in ${range}`);
      expect(title).not.toContain("all-time");
    }
  });
});
