import { describe, expect, it } from "vitest";
import { calculateDrawdown, downsample, type PricePoint } from "./drawdown";

const basic: PricePoint[] = [
  { date: "2024-06-01", close: 6000 },
  { date: "2024-06-12", close: 6200 },
  { date: "2025-02-19", close: 6850 }, // peak
  { date: "2025-03-01", close: 6400 },
  { date: "2025-03-10", close: 6200 }, // current
];

/** Build a dense, evenly-spaced series for downsampling tests. */
function dense(n: number, close: (i: number) => number): PricePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2000, 0, 1) + i * 86_400_000)
      .toISOString()
      .slice(0, 10),
    close: close(i),
  }));
}

describe("calculateDrawdown", () => {
  it("finds peak, drawdown %, and last-seen date", () => {
    const r = calculateDrawdown(basic);
    expect(r.peakPrice).toBe(6850);
    expect(r.peakDate).toBe("2025-02-19");
    expect(r.currentPrice).toBe(6200);
    expect(r.drawdownPct).toBeCloseTo(-0.0949, 4);
    expect(r.lastSeenDate).toBe("2024-06-12");
    expect(r.lastSeenPrice).toBe(6200);
    expect(r.isAtHigh).toBe(false);
    expect(r.neverSeenLower).toBe(false);
    // 2024-06-12 -> 2025-03-10
    expect(r.calendarDaysLost).toBe(271);
    expect(r.tradingDaysLost).toBe(3); // 5 points - 1 - idx(1)
    expect(r.underwaterDays).toBeGreaterThan(0);
  });

  it("reports at-high when last point is the peak", () => {
    const r = calculateDrawdown([
      { date: "2024-01-01", close: 5000 },
      { date: "2024-06-01", close: 6000 },
    ]);
    expect(r.isAtHigh).toBe(true);
    expect(r.drawdownPct).toBe(0);
    expect(r.calendarDaysLost).toBe(0);
  });

  it("handles unsorted input", () => {
    const r = calculateDrawdown([...basic].reverse());
    expect(r.peakDate).toBe("2025-02-19");
    expect(r.lastSeenDate).toBe("2024-06-12");
  });

  it("flags neverSeenLower when current is below all pre-peak history", () => {
    const r = calculateDrawdown([
      { date: "2024-01-01", close: 6000 },
      { date: "2024-06-01", close: 6850 }, // peak
      { date: "2024-07-01", close: 5900 }, // below everything before peak
    ]);
    expect(r.neverSeenLower).toBe(true);
    expect(r.lastSeenDate).toBeNull();
    expect(r.calendarDaysLost).toBeNull();
  });

  it("throws on empty series", () => {
    expect(() => calculateDrawdown([])).toThrow("Empty price series");
  });

  it("neverSeenLower means 'below every close before the peak', not 'lowest in range'", () => {
    // 50 is lower than the current 60, yet the flag is set: no pre-peak close
    // was this low. The UI copy must not claim "lowest close in the range".
    const s: PricePoint[] = [
      { date: "2024-01-01", close: 100 },
      { date: "2024-01-02", close: 120 }, // peak
      { date: "2024-01-03", close: 50 },
      { date: "2024-01-04", close: 60 }, // current
    ];
    const r = calculateDrawdown(s);

    expect(r.neverSeenLower).toBe(true);
    expect(r.lastSeenDate).toBeNull();
    expect(r.calendarDaysLost).toBeNull();
    expect(r.tradingDaysLost).toBeNull();
    // The range does contain a lower close — proving the old copy was wrong.
    expect(Math.min(...s.map((p) => p.close))).toBeLessThan(r.currentPrice);
  });

  it("counts trading days as the bars elapsed after the last-seen date", () => {
    const s: PricePoint[] = [
      { date: "2024-01-01", close: 100 },
      { date: "2024-01-02", close: 200 },
      { date: "2024-01-03", close: 80 }, // pre-peak, <= current
      { date: "2024-01-04", close: 300 }, // peak
      { date: "2024-01-05", close: 90 },
      { date: "2024-01-06", close: 90 }, // current
    ];
    const r = calculateDrawdown(s);

    expect(r.lastSeenDate).toBe("2024-01-03");
    // 01-04, 01-05, 01-06 elapse between the last-seen date and now.
    expect(r.tradingDaysLost).toBe(3);
    expect(r.calendarDaysLost).toBe(3);
  });
});

describe("downsample", () => {
  it("returns input when under limit", () => {
    expect(downsample(basic, 500)).toHaveLength(5);
    expect(downsample(basic, 500)).toBe(basic);
  });

  it("caps points and preserves last date", () => {
    const big: PricePoint[] = Array.from({ length: 1000 }, (_, i) => ({
      date: `2020-01-${String((i % 28) + 1).padStart(2, "0")}-x${i}`,
      close: 100 + i,
    }));
    const out = downsample(big, 100);
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out[out.length - 1]?.date).toBe(big[big.length - 1]?.date);
  });

  it("drops an off-grid peak when no keep list is given (the old bug)", () => {
    // Rise to an odd-indexed peak, then fall — 1200 points stride by 2, so an
    // odd index never lands on the sampling grid.
    const s = dense(1200, (i) => (i < 437 ? 100 + i * 0.1 : i === 437 ? 300 : 160));
    const { peakDate } = calculateDrawdown(s);

    expect(downsample(s, 600).some((p) => p.date === peakDate)).toBe(false);
  });

  it("always keeps peak, last-seen and current when passed as keep dates", () => {
    const s = dense(1200, (i) => (i < 437 ? 100 + i * 0.1 : i === 437 ? 300 : 160));
    const { peakDate, lastSeenDate, currentDate } = calculateDrawdown(s);

    const out = downsample(s, 600, [peakDate, lastSeenDate, currentDate]);
    const dates = new Set(out.map((p) => p.date));

    expect(dates.has(peakDate)).toBe(true);
    expect(dates.has(currentDate)).toBe(true);
    if (lastSeenDate) expect(dates.has(lastSeenDate)).toBe(true);
    // Still a downsampled series, just with at most 3 extra points.
    expect(out.length).toBeLessThanOrEqual(603);
  });

  it("returns points in ascending date order", () => {
    const s = dense(1200, (i) => 100 + Math.sin(i / 20) * 10);
    const { peakDate, lastSeenDate } = calculateDrawdown(s);
    const out = downsample(s, 600, [peakDate, lastSeenDate]);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].date < out[i].date).toBe(true);
    }
  });

  it("ignores keep dates that are absent from the series", () => {
    const s = dense(1200, (i) => 100 + i);
    expect(
      downsample(s, 600, ["1999-01-01", null]).length
    ).toBeLessThanOrEqual(602);
  });
});
