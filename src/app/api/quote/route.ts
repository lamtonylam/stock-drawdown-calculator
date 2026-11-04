import { NextResponse } from "next/server";
import {
  calculateDrawdown,
  daysBetween,
  downsample,
  findLastSeenBefore,
  type DrawdownResult,
  type PricePoint,
} from "@/lib/drawdown";
import {
  DEFAULT_RANGE,
  isRangeKey,
  period1ForRange,
  RANGES,
  type RangeKey,
} from "@/lib/ranges";
import { parseAsOf } from "@/lib/asof";
import { noDataMessage } from "@/lib/errors";
import { createLru } from "@/lib/lru";
import { fetchSeries, type QuoteFetch } from "@/lib/yahoo";

const UPSTREAM_TIMEOUT_MS = 10_000;

export const CACHE_TTL_MS = 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 200;
/**
 * Backtests always fetch full history, so the response cache (keyed by range)
 * re-downloads the same ~14k bars once per range: `3Y → MAX → 5Y` on one date
 * used to be three identical upstream calls. Cache the fetch itself, keyed
 * without the range. Deliberately small — these entries hold whole histories
 * (~1-2 MB for a long index series), unlike the downsampled responses above.
 */
export const HISTORY_CACHE_MAX_ENTRIES = 8;

/**
 * Cacheable for a short window, then revalidated in the background. Without
 * this the browser refetched on every toggle despite the server-side TTL.
 */
const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";

const MAX_TICKER_LENGTH = 12;
/** ^GSPC, BRK-B, BTC-USD, 005930.KS, EURUSD=X … */
const TICKER_RE = /^\^?[A-Z0-9][A-Z0-9.\-=]{0,11}$/;

/** Response shape consumed by the client (see `ApiResponse` in page.tsx). */
export interface QuotePayload extends DrawdownResult {
  ticker: string;
  name: string;
  currency: string;
  range: RangeKey;
  /** Requested backtest date (YYYY-MM-DD), or null for live. */
  asOf: string | null;
  /** Ranges whose window can show the crash (always all four when live). */
  validRanges: RangeKey[];
  series: PricePoint[];
  /** Total closes in the range, before downsampling. */
  points: number;
}

/**
 * Bounded LRUs. A plain Map grew forever, so every distinct symbol — including
 * junk from a scripted client — permanently pinned its payload in memory.
 * Exported so tests can reset them between cases.
 */
export const quoteCache = createLru<string, QuotePayload>(
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS
);
export const historyCache = createLru<string, QuoteFetch>(
  HISTORY_CACHE_MAX_ENTRIES,
  CACHE_TTL_MS
);

/**
 * Fetch (or reuse) the series a request needs.
 *
 * Backtests always pull `MAX` history: the stats keep the requested window's
 * contract, but `validRanges` and the last-seen fallback need the whole past.
 * That fetch does not depend on `range`, so it is cached on `ticker:asOf`.
 */
async function fetchHistory(
  ticker: string,
  range: RangeKey,
  asOf: string | null
): Promise<QuoteFetch> {
  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  if (!asOf) return fetchSeries(ticker, range, signal);

  const key = `${ticker}:${asOf}`;
  const cached = historyCache.get(key);
  if (cached) return cached;

  const fetched = await fetchSeries(ticker, "MAX", signal, asOf);
  historyCache.set(key, fetched);
  return fetched;
}

/**
 * Normalise and validate the `ticker` query param.
 * Returns null when the value is not a plausible symbol, so the caller can
 * answer 400 instead of forwarding it upstream.
 */
export function normalizeTicker(raw: string | null): string | null {
  const ticker = (raw ?? "").trim().toUpperCase();
  if (!ticker) return "^GSPC";
  if (ticker.length > MAX_TICKER_LENGTH || !TICKER_RE.test(ticker)) return null;
  return ticker;
}

/**
 * Map an upstream failure message to a status code.
 *
 * Only messages about the *symbol* may become a 404. A loose `/not found/`
 * also matched DNS failures ("host not found"), which reported an outage as
 * the caller's fault and hid it from 5xx monitoring, while `/invalid/` caught
 * unrelated validation errors. Anything unrecognised stays a 502.
 */
export function statusForUpstreamError(message: string): number {
  // Timeouts first: "the operation was aborted" must never read as not-found.
  if (/abort|timeout|timed out/i.test(message)) return 504;
  if (
    /no data found|not enough data|delisted|invalid symbol|status (?:400|404)/i.test(
      message
    )
  ) {
    return 404;
  }
  return 502;
}

export async function GET(req: Request) {
  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(req.url).searchParams;
  } catch {
    return NextResponse.json({ error: "Invalid request URL" }, { status: 400 });
  }

  const ticker = normalizeTicker(searchParams.get("ticker"));
  if (!ticker) {
    return NextResponse.json(
      { error: "Invalid ticker symbol" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rangeRaw = (searchParams.get("range") ?? DEFAULT_RANGE).toUpperCase();
  const range: RangeKey = isRangeKey(rangeRaw) ? rangeRaw : DEFAULT_RANGE;

  const { asOf, error: asOfError } = parseAsOf(searchParams.get("asof"));
  if (asOfError) {
    return NextResponse.json(
      { error: asOfError },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const key = `${ticker}:${range}:${asOf ?? "live"}`;
  const hit = quoteCache.get(key);
  if (hit) {
    return NextResponse.json(hit, {
      headers: { "X-Cache": "HIT", "Cache-Control": CACHE_CONTROL },
    });
  }

  try {
    const fetched = await fetchHistory(ticker, range, asOf);
    // Slice defensively: the fetcher already caps at `asOf`, but a mocked
    // series may extend past it.
    const history = asOf
      ? fetched.series.filter((p) => p.date <= asOf)
      : fetched.series;
    if (history.length < 2) {
      throw new Error(noDataMessage(fetched.ticker, asOf));
    }
    const sliced =
      asOf && range !== "MAX"
        ? history.filter((p) => p.date >= period1ForRange(range, asOf))
        : history;
    if (sliced.length < 2) {
      throw new Error(noDataMessage(fetched.ticker, asOf));
    }
    let stats = calculateDrawdown(sliced);

    // Ranges whose window misses the all-time peak or the time-machine date
    // cannot show the crash — the client locks those options out for this
    // date. MAX is always offered: nothing better exists when even full
    // history has no lower close.
    let validRanges: RangeKey[] = [...RANGES];
    if (asOf) {
      let maxPeak = history[0];
      for (const p of history) {
        if (p.close > maxPeak.close) maxPeak = p;
      }
      validRanges = RANGES.filter((rk) => {
        if (rk === "MAX") return true;
        const slice = history.filter(
          (p) => p.date >= period1ForRange(rk, asOf)
        );
        if (slice.length < 2) return false;
        const s = calculateDrawdown(slice);
        return s.peakDate === maxPeak.date && !s.neverSeenLower;
      });
    }

    // The window can miss the last-seen date even when it holds the peak
    // (GFC on 3Y: $676 last traded in 1996). Look it up in full history
    // rather than reporting a false "Never".
    if (asOf && range !== "MAX" && stats.neverSeenLower) {
      const seen = findLastSeenBefore(
        history,
        stats.peakDate,
        stats.currentPrice
      );
      if (seen) {
        const idx = history.findIndex((p) => p.date === seen.date);
        stats = {
          ...stats,
          lastSeenDate: seen.date,
          lastSeenPrice: seen.close,
          calendarDaysLost: daysBetween(seen.date, stats.currentDate),
          tradingDaysLost: history.length - 1 - idx,
          neverSeenLower: false,
        };
      }
    }

    const payload = {
      ticker: fetched.ticker,
      name: fetched.longName ?? fetched.ticker,
      currency: fetched.currency ?? "USD",
      range,
      asOf,
      validRanges,
      ...stats,
      series: downsample(sliced, 600, [
        stats.peakDate,
        stats.lastSeenDate,
        stats.currentDate,
      ]),
      points: sliced.length,
    };

    quoteCache.set(key, payload);
    return NextResponse.json(payload, {
      headers: { "X-Cache": "MISS", "Cache-Control": CACHE_CONTROL },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    const status = statusForUpstreamError(msg);

    return NextResponse.json(
      {
        error: status === 504 ? "Yahoo Finance took too long to respond" : msg,
      },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
