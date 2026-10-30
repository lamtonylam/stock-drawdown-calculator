import { NextResponse } from "next/server";
import { calculateDrawdown, downsample, type DrawdownResult, type PricePoint } from "@/lib/drawdown";
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from "@/lib/ranges";
import { fetchSeries } from "@/lib/yahoo";

const UPSTREAM_TIMEOUT_MS = 10_000;

export const CACHE_TTL_MS = 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 200;

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
  series: PricePoint[];
  /** Total closes in the range, before downsampling. */
  points: number;
}

interface CacheEntry {
  at: number;
  data: QuotePayload;
}

/**
 * Bounded LRU. A plain Map grew forever, so every distinct symbol — including
 * junk from a scripted client — permanently pinned its payload in memory.
 */
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CacheEntry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  // Re-insert to mark as most recently used.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, entry: CacheEntry): void {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
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
 * Yahoo reports unknown symbols as "No data found, symbol may be delisted" —
 * which the old regex missed, so bad tickers came back as 502 and polluted the
 * 5xx rate. Timeouts are separated out so they can be retried/alerted on.
 */
export function statusForUpstreamError(message: string): number {
  if (/abort|timeout|timed out/i.test(message)) return 504;
  if (/not enough data|no data|not found|delisted|invalid|404/i.test(message)) {
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

  const key = `${ticker}:${range}`;
  const hit = cacheGet(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": CACHE_CONTROL },
    });
  }

  try {
    const fetched = await fetchSeries(
      ticker,
      range,
      AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    );
    const stats = calculateDrawdown(fetched.series);
    const payload = {
      ticker: fetched.ticker,
      name: fetched.longName ?? fetched.ticker,
      currency: fetched.currency ?? "USD",
      range,
      ...stats,
      series: downsample(fetched.series, 600, [
        stats.peakDate,
        stats.lastSeenDate,
        stats.currentDate,
      ]),
      points: fetched.series.length,
    };

    cacheSet(key, { at: Date.now(), data: payload });
    return NextResponse.json(payload, {
      headers: { "X-Cache": "MISS", "Cache-Control": CACHE_CONTROL },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    const status = statusForUpstreamError(msg);

    return NextResponse.json(
      {
        error:
          status === 504
            ? "Yahoo Finance took too long to respond"
            : msg,
      },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
