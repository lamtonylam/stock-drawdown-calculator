import { describe, expect, it } from "vitest";
import { BACKTEST_PRESETS, PRESETS } from "./presets";

describe("PRESETS", () => {
  it("has unique, already-trimmed symbols", () => {
    expect(PRESETS.length).toBeGreaterThan(0);
    expect(new Set(PRESETS).size).toBe(PRESETS.length);
    for (const symbol of PRESETS) expect(symbol.trim()).toBe(symbol);
  });

  it("only contains symbols the quote API will accept", () => {
    // Mirrors the validation in app/api/quote/route.ts — a preset that
    // fails it would 400 on click instead of showing a drawdown.
    const valid = /^\^?[A-Z0-9][A-Z0-9.\-=]{0,11}$/;
    for (const symbol of PRESETS) expect(symbol).toMatch(valid);
  });
});

describe("BACKTEST_PRESETS", () => {
  it("uses YYYY-MM-DD dates that exist on the calendar", () => {
    for (const preset of BACKTEST_PRESETS) {
      expect(preset.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [y, m, d] = preset.date.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      // Round-trip catches 2025-02-30 and 2025-13-01, which a regex allows.
      expect(dt.getUTCFullYear()).toBe(y);
      expect(dt.getUTCMonth()).toBe(m - 1);
      expect(dt.getUTCDate()).toBe(d);
    }
  });

  it("keeps dates unique and chronological", () => {
    const dates = BACKTEST_PRESETS.map((p) => p.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
  });

  it("gives every preset a label", () => {
    for (const preset of BACKTEST_PRESETS) {
      expect(preset.label.trim().length).toBeGreaterThan(0);
    }
  });
});
