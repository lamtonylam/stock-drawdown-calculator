import { describe, expect, it } from "vitest";
import { normalizeBars } from "./yahoo";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("normalizeBars", () => {
  it("drops bars with no usable price", () => {
    const series = normalizeBars([
      { date: day("2024-01-02"), close: 100, adjclose: 99 },
      { date: day("2024-01-03"), close: null, adjclose: null },
      { date: day("2024-01-04"), close: 0 },
      { date: day("2024-01-05"), close: 0 },
      { date: day("2024-01-05"), close: Number.NaN },
    ]);
    expect(series).toEqual([{ date: "2024-01-02", close: 99 }]);
  });

  it("prefers the adjusted close and falls back to the raw close", () => {
    const series = normalizeBars([
      { date: day("2024-01-02"), close: 100, adjclose: 90 },
      { date: day("2024-01-03"), close: 101 },
    ]);
    expect(series.map((p) => p.close)).toEqual([90, 101]);
  });

  it("collapses duplicate dates, keeping the last (settled) bar", () => {
    // Yahoo occasionally returns a partial bar next to the settled one. Two
    // points on one date put two dots on one x-axis tick and make
    // calculateDrawdown count phantom sessions.
    const series = normalizeBars([
      { date: day("2024-01-02"), close: 100 },
      { date: day("2024-01-03"), close: 111 }, // partial
      { date: day("2024-01-03"), close: 110 }, // settled, wins
    ]);
    expect(series).toEqual([
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 110 },
    ]);
  });

  it("returns an ascending series even when Yahoo sends it unsorted", () => {
    const series = normalizeBars([
      { date: day("2024-03-01"), close: 3 },
      { date: day("2024-01-01"), close: 1 },
      { date: day("2024-02-01"), close: 2 },
    ]);
    expect(series.map((p) => p.date)).toEqual([
      "2024-01-01",
      "2024-02-01",
      "2024-03-01",
    ]);
  });

  it("tolerates missing or empty quotes", () => {
    expect(normalizeBars(undefined)).toEqual([]);
    expect(normalizeBars([])).toEqual([]);
    expect(normalizeBars([{ date: null, close: 5 }])).toEqual([]);
  });
});
