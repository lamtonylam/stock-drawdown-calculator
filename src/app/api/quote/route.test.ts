import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PricePoint } from "@/lib/drawdown";
import { noDataMessage } from "@/lib/errors";

const { fetchSeriesMock } = vi.hoisted(() => ({ fetchSeriesMock: vi.fn() }));

vi.mock("@/lib/yahoo", () => ({ fetchSeries: fetchSeriesMock }));

const {
  GET,
  historyCache,
  normalizeTicker,
  quoteCache,
  statusForUpstreamError,
} = await import("./route");

function req(qs: string): Request {
  return new Request(`http://localhost/api/quote${qs}`);
}

/** 1200 points: rise, odd-indexed peak, then a long slide. */
function denseSeries(): PricePoint[] {
  return Array.from({ length: 1200 }, (_, i) => ({
    date: new Date(Date.UTC(2000, 0, 1) + i * 86_400_000)
      .toISOString()
      .slice(0, 10),
    close: i < 437 ? 100 + i * 0.1 : i === 437 ? 300 : 160,
  }));
}

beforeEach(() => {
  fetchSeriesMock.mockReset();
  // The caches are module state: without this, one case's HIT is another's
  // MISS and the order of the suite decides the result.
  quoteCache.clear();
  historyCache.clear();
});

describe("normalizeTicker", () => {
  it("defaults to the S&P 500 when absent or blank", () => {
    expect(normalizeTicker(null)).toBe("^GSPC");
    expect(normalizeTicker("")).toBe("^GSPC");
    expect(normalizeTicker("   ")).toBe("^GSPC");
  });

  it("uppercases and trims real symbols", () => {
    expect(normalizeTicker(" aapl ")).toBe("AAPL");
    expect(normalizeTicker("brk-b")).toBe("BRK-B");
    expect(normalizeTicker("eurusd=x")).toBe("EURUSD=X");
    expect(normalizeTicker("^gspc")).toBe("^GSPC");
  });

  it("rejects junk instead of forwarding it upstream", () => {
    expect(normalizeTicker("<script>")).toBeNull();
    expect(normalizeTicker("A".repeat(13))).toBeNull();
    expect(normalizeTicker("AAPL,MSFT")).toBeNull();
    expect(normalizeTicker("../../etc/passwd")).toBeNull();
  });
});

describe("statusForUpstreamError", () => {
  it("maps Yahoo's unknown-symbol message to 404 (the old 502 bug)", () => {
    // Verbatim message returned by yahoo-finance2 for a bogus symbol.
    expect(
      statusForUpstreamError("No data found, symbol may be delisted")
    ).toBe(404);
  });

  it("maps short series and explicit 404s to 404", () => {
    expect(
      statusForUpstreamError("Not enough data for ZZZZ (check symbol)")
    ).toBe(404);
    expect(statusForUpstreamError("Invalid symbol")).toBe(404);
    expect(statusForUpstreamError("Request failed with status 404")).toBe(404);
  });

  it("maps timeouts to 504", () => {
    expect(
      statusForUpstreamError("The operation was aborted due to timeout")
    ).toBe(504);
    expect(statusForUpstreamError("Request timeout")).toBe(504);
  });

  it("maps everything else to 502", () => {
    expect(
      statusForUpstreamError("getaddrinfo ENOTFOUND query1.finance.yahoo.com")
    ).toBe(502);
    expect(statusForUpstreamError("Fetch failed")).toBe(502);
  });

  it("does not read a transport failure as a bad symbol", () => {
    // A loose /not found/ used to turn these into 404s, blaming the caller for
    // an outage and hiding it from 5xx monitoring.
    expect(statusForUpstreamError("dial tcp 1.2.3.4:443: host not found")).toBe(
      502
    );
    expect(statusForUpstreamError("Invalid URL")).toBe(502);
    expect(statusForUpstreamError("socket hang up")).toBe(502);
  });

  it("maps the shared no-data message to 404", () => {
    expect(statusForUpstreamError(noDataMessage("^GSPC", "2009-03-09"))).toBe(
      404
    );
    expect(statusForUpstreamError(noDataMessage("^GSPC", null))).toBe(404);
  });
});

describe("GET /api/quote", () => {
  it("answers 400 for an invalid ticker without calling upstream", async () => {
    const res = await GET(req("?ticker=%3Cscript%3E"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid ticker symbol" });
    expect(fetchSeriesMock).not.toHaveBeenCalled();
  });

  it("returns stats plus a downsampled series that keeps the markers", async () => {
    const series = denseSeries();
    fetchSeriesMock.mockResolvedValue({
      ticker: "^GSPC",
      longName: "S&P 500",
      currency: "USD",
      series,
    });

    const res = await GET(req("?ticker=%5Egspc&range=MAX"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ticker).toBe("^GSPC");
    expect(body.range).toBe("MAX");
    expect(body.points).toBe(1200);

    const dates = new Set(body.series.map((p: PricePoint) => p.date));
    expect(body.series.length).toBeLessThanOrEqual(603);
    expect(dates.has(body.peakDate)).toBe(true);
    expect(dates.has(body.currentDate)).toBe(true);
    if (body.lastSeenDate) expect(dates.has(body.lastSeenDate)).toBe(true);
  });

  it("passes an abort signal so a hung upstream cannot pin the request", async () => {
    fetchSeriesMock.mockResolvedValue({
      ticker: "AAPL",
      currency: "USD",
      series: [
        { date: "2024-01-01", close: 100 },
        { date: "2024-01-02", close: 90 },
      ],
    });

    await GET(req("?ticker=AAPL&range=1Y"));
    expect(fetchSeriesMock).toHaveBeenCalledOnce();
    expect(fetchSeriesMock.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
  });

  it("serves a cached payload and marks it HIT", async () => {
    fetchSeriesMock.mockResolvedValue({
      ticker: "MSFT",
      currency: "USD",
      series: [
        { date: "2024-01-01", close: 100 },
        { date: "2024-01-02", close: 90 },
      ],
    });

    const first = await GET(req("?ticker=MSFT&range=3Y"));
    expect(first.headers.get("X-Cache")).toBe("MISS");
    expect(first.headers.get("Cache-Control")).toContain("s-maxage");

    const second = await GET(req("?ticker=MSFT&range=3Y"));
    expect(second.headers.get("X-Cache")).toBe("HIT");
    expect(fetchSeriesMock).toHaveBeenCalledOnce();
  });

  it("falls back to the default range for unknown values", async () => {
    fetchSeriesMock.mockResolvedValue({
      ticker: "AAPL",
      currency: "USD",
      series: [
        { date: "2024-01-01", close: 100 },
        { date: "2024-01-02", close: 90 },
      ],
    });

    const body = await (await GET(req("?ticker=AAPL&range=nope"))).json();
    expect(body.range).toBe("5Y");
  });

  it("maps an upstream failure to the right status code", async () => {
    fetchSeriesMock.mockRejectedValue(
      new Error("No data found, symbol may be delisted")
    );

    const res = await GET(req("?ticker=ZZZZ"));
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 400 for a malformed backtest date without calling upstream", async () => {
    const res = await GET(req("?ticker=AAPL&asof=not-a-date"));
    expect(res.status).toBe(400);
    expect(fetchSeriesMock).not.toHaveBeenCalled();
  });

  it("answers 400 for a future backtest date", async () => {
    const res = await GET(req("?ticker=AAPL&asof=2999-01-01"));
    expect(res.status).toBe(400);
    expect(fetchSeriesMock).not.toHaveBeenCalled();
  });

  it("cuts the series at the backtest date so 2008 losses are visible", async () => {
    fetchSeriesMock.mockResolvedValue({
      ticker: "^GSPC",
      currency: "USD",
      series: [
        { date: "2007-10-09", close: 1565 },
        { date: "2008-09-15", close: 1255 },
        { date: "2008-12-31", close: 903 },
        { date: "2009-03-09", close: 676 },
        { date: "2024-01-02", close: 4770 },
      ],
    });

    const body = await (
      await GET(req("?ticker=%5EGSPC&range=MAX&asof=2008-12-31"))
    ).json();
    expect(body.asOf).toBe("2008-12-31");
    expect(body.currentDate).toBe("2008-12-31");
    expect(body.points).toBe(3);
    expect(body.drawdownPct).toBeCloseTo((903 - 1565) / 1565, 10);
    // The mocked fetcher ignores `asOf`, so the route must slice itself.
    expect(fetchSeriesMock.mock.calls[0][3]).toBe("2008-12-31");
  });

  it("locks out ranges whose window misses the peak or the time-machine date", async () => {
    // GFC shape: peak Oct-2007, bottom Mar-2009 at $676 — last traded that
    // low in 1996, far outside any short window.
    fetchSeriesMock.mockResolvedValue({
      ticker: "^GSPC",
      currency: "USD",
      series: [
        { date: "1996-09-12", close: 671 },
        { date: "2004-06-01", close: 1150 },
        { date: "2007-10-09", close: 1565 },
        { date: "2008-09-15", close: 1255 },
        { date: "2009-03-09", close: 676 },
        { date: "2024-01-02", close: 4770 },
      ],
    });

    const body = await (
      await GET(req("?ticker=%5EGSPC&range=3Y&asof=2009-03-09"))
    ).json();
    // 1Y misses the peak; 3Y/5Y hold the peak but miss the 1996 low.
    expect(body.validRanges).toEqual(["MAX"]);
    // ...yet the answer is still found in full history, not "Never".
    expect(body.neverSeenLower).toBe(false);
    expect(body.lastSeenDate).toBe("1996-09-12");
    expect(body.tradingDaysLost).toBe(4);

    // That date predates the 3Y window, so it cannot be a point on the chart.
    // The client detects this (see DrawdownChart) and says "before this
    // window" instead of drawing a legend swatch for a dot that is missing.
    const dates = body.series.map((p: PricePoint) => p.date);
    expect(dates).not.toContain(body.lastSeenDate);
  });

  it("keeps the last-seen marker when it does fall inside the window", async () => {
    // Short history: the peak and the earlier low are both in the 5Y window,
    // so the marker must survive downsampling.
    fetchSeriesMock.mockResolvedValue({
      ticker: "AAPL",
      currency: "USD",
      series: [
        { date: "2023-01-03", close: 130 },
        { date: "2024-01-02", close: 185 },
        { date: "2024-06-03", close: 190 },
        { date: "2024-12-02", close: 132 },
      ],
    });

    const body = await (await GET(req("?ticker=AAPL&range=5Y"))).json();
    const dates = body.series.map((p: PricePoint) => p.date);
    expect(body.lastSeenDate).toBe("2023-01-03");
    expect(dates).toContain(body.lastSeenDate);
    expect(dates).toContain(body.peakDate);
    expect(dates).toContain(body.currentDate);
  });

  it("reuses one full-history fetch across ranges of the same backtest date", async () => {
    // Backtests always pull MAX, so the range only slices what came back.
    // Without a range-independent cache, 3Y → MAX → 5Y was three identical
    // ~14k-bar downloads of the same symbol and date.
    fetchSeriesMock.mockResolvedValue({
      ticker: "^GSPC",
      currency: "USD",
      series: [
        { date: "2007-10-09", close: 1565 },
        { date: "2008-09-15", close: 1255 },
        { date: "2009-03-09", close: 676 },
      ],
    });

    for (const range of ["1Y", "3Y", "5Y", "MAX"]) {
      const res = await GET(
        req(`?ticker=%5EGSPC&range=${range}&asof=2009-03-09`)
      );
      expect(res.status).toBe(200);
    }

    expect(fetchSeriesMock).toHaveBeenCalledOnce();
    expect(fetchSeriesMock.mock.calls[0][1]).toBe("MAX");
    // Every range still gets its own cached *response*.
    expect(quoteCache.size).toBe(4);
    expect(historyCache.size).toBe(1);
  });

  it("404s when nothing traded on or before the backtest date", async () => {
    fetchSeriesMock.mockResolvedValue({
      ticker: "AAPL",
      currency: "USD",
      series: [
        { date: "2008-12-31", close: 85 },
        { date: "2024-01-02", close: 185 },
      ],
    });

    const res = await GET(req("?ticker=AAPL&asof=2007-01-01"));
    expect(res.status).toBe(404);
  });
});
