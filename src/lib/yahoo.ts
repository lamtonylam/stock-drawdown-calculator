import YahooFinance from "yahoo-finance2";
import type { PricePoint } from "./drawdown";
import { dayAfterAsOf } from "./asof";
import { friendlyExchange } from "./names";
import { period1ForRange, type RangeKey } from "./ranges";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/**
 * Every range uses daily bars. `MAX` used to switch to weekly bars, which
 * silently turned "trading days of progress" into "weeks" and moved the peak to
 * a weekly close; Yahoo serves daily data back to 1970 in well under a second.
 * Window starts come from `period1ForRange` in ranges.ts (single source).
 */
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
  /** Human venue name ("Helsinki") — falls back to `exchange` ("HEL"). */
  exchangeDisp: string;
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
  // Ask for more candidates than we show: Yahoo's ranking is flaky and
  // regional listings (e.g. NOKIA.HE next to NOK) can sit below the cutoff.
  const res = await yf.search(
    q,
    { quotesCount: 15, newsCount: 0 },
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
        exchangeDisp: friendlyExchange(
          r.exchange ?? "",
          (r as { exchDisp?: string }).exchDisp
        ),
        type: r.typeDisp ?? r.quoteType ?? "",
      };
    })
    .slice(0, 8);
}

/**
 * Fetch adjusted daily closes from Yahoo Finance.
 * `asOf` (YYYY-MM-DD) backtests a past date: Yahoo is asked only for bars up
 * to that day (its `period2` is exclusive, hence +1 day) and the series is
 * defensively cut there too, so the drawdown math sees that day as "today".
 */
export async function fetchSeries(
  rawTicker: string,
  range: RangeKey,
  signal?: AbortSignal,
  asOf?: string | null
): Promise<QuoteFetch> {
  const ticker = rawTicker.trim().toUpperCase() || "^GSPC";
  const period1 = period1ForRange(range, asOf);
  const moduleOptions = signal ? { fetchOptions: { signal } } : {};
  // `period2` must be omitted entirely on live requests: yahoo-finance2
  // rejects the key when present-but-undefined. As a Date (not a bare
  // YYYY-MM-DD string) so it satisfies the "date'ish" schema.
  const chartOptions: { period1: string; period2?: Date; interval: "1d" } = {
    period1,
    interval: "1d",
  };
  if (asOf) chartOptions.period2 = new Date(`${dayAfterAsOf(asOf)}T00:00:00Z`);

  const [chart, info] = await Promise.all([
    yf.chart(ticker, chartOptions, moduleOptions),
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
  const capped = asOf ? series.filter((p) => p.date <= asOf) : series;

  if (capped.length < 2) {
    throw new Error(
      asOf
        ? `Not enough data for ${ticker} on or before ${asOf}`
        : `Not enough data for ${ticker} (check symbol)`
    );
  }

  return {
    ticker,
    longName: price?.longName ?? price?.shortName ?? undefined,
    currency: price?.currency,
    series: capped,
  };
}
