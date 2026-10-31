import YahooFinance from "yahoo-finance2";
import type { PricePoint } from "./drawdown";
import type { RangeKey } from "./ranges";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/**
 * Every range uses daily bars. `MAX` used to switch to weekly bars, which
 * silently turned "trading days of progress" into "weeks" and moved the peak to
 * a weekly close; Yahoo serves daily data back to 1970 in well under a second.
 */
const RANGE_TO_PERIOD: Record<RangeKey, string> = {
  "1Y": daysAgo(365),
  "2Y": daysAgo(730),
  "5Y": daysAgo(1825),
  MAX: "1970-01-01",
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface QuoteFetch {
  ticker: string;
  longName?: string;
  currency?: string;
  series: PricePoint[];
}

export interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

/**
 * Natural-language symbol search ("apple" → AAPL, "s&p 500" → ^GSPC).
 * Quotes-only, no news — keeps the response small and fast.
 */
export async function searchSymbols(
  query: string,
  signal?: AbortSignal
): Promise<SymbolResult[]> {
  const q = query.trim().slice(0, 60);
  if (!q) return [];
  const moduleOptions = signal ? { fetchOptions: { signal } } : {};
  const res = await yf.search(
    q,
    { quotesCount: 8, newsCount: 0 },
    moduleOptions
  );
  return (res.quotes ?? [])
    .filter(
      (qt): qt is typeof qt & { symbol: string } =>
        typeof (qt as { symbol?: unknown }).symbol === "string" &&
        (qt as { isYahooFinance?: unknown }).isYahooFinance !== false
    )
    .map((qt) => {
      const r = qt as {
        symbol: string;
        shortname?: string;
        longname?: string;
        exchange?: string;
        quoteType?: string;
        typeDisp?: string;
      };
      return {
        symbol: r.symbol,
        name: r.shortname ?? r.longname ?? r.symbol,
        exchange: r.exchange ?? "",
        type: r.typeDisp ?? r.quoteType ?? "",
      };
    })
    .slice(0, 8);
}

/** Fetch adjusted daily closes from Yahoo Finance. */
export async function fetchSeries(
  rawTicker: string,
  range: RangeKey,
  signal?: AbortSignal
): Promise<QuoteFetch> {
  const ticker = rawTicker.trim().toUpperCase() || "^GSPC";
  const period1 = RANGE_TO_PERIOD[range] ?? RANGE_TO_PERIOD["5Y"];
  const moduleOptions = signal ? { fetchOptions: { signal } } : {};

  const [chart, info] = await Promise.all([
    yf.chart(ticker, { period1, interval: "1d" }, moduleOptions),
    // Company name / currency are cosmetic — never fail the request over them.
    yf
      .quoteSummary(ticker, { modules: ["price"] }, moduleOptions)
      .catch(() => null),
  ]);

  const price = info?.price;
  const series: PricePoint[] = (chart.quotes ?? [])
    .filter((q) => q.date && (q.adjclose ?? q.close) != null)
    .map((q) => ({
      date: toISODate(new Date(q.date)),
      close: Number((q.adjclose ?? q.close) as number),
    }))
    .filter((p) => Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (series.length < 2) {
    throw new Error(`Not enough data for ${ticker} (check symbol)`);
  }

  return {
    ticker,
    longName: price?.longName ?? price?.shortName ?? undefined,
    currency: price?.currency,
    series,
  };
}
