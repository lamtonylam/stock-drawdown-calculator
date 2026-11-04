# Drawdown Time Machine

How far has a ticker fallen from its peak — and **when did it last trade this low?**

Most drawdown charts tell you the percentage. This one also tells you the _date_: the most recent trading day, before the peak, when the price was at or below today's price. The gap between that day and today is how much progress the decline erased.

Default ticker is `^GSPC` (S&P 500). Works with anything Yahoo Finance serves: `^NDX`, `^DJI`, `AAPL`, `NVDA`, `BTC-USD`, `EURUSD=X`, `005930.KS`, …

```bash
npm install
npm run dev
# → http://localhost:3000
```

## What it shows

| Stat               | Meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| Drawdown           | `(current − peak) / peak`, from adjusted daily closes          |
| Last seen this low | Most recent close **before the peak** that was ≤ today's price |
| Calendar days lost | Days between that date and today                               |
| Trading days lost  | Same span counted in closes in the series                      |
| Days since peak    | Calendar days since the peak                                   |
| Peak / current     | Prices and dates behind the numbers                            |

Selectable ranges are `1Y`, `3Y`, `5Y`, `MAX` (default `5Y`). All ranges use **daily** bars; `MAX` goes back to 1970. Values are split- and dividend-adjusted closes, so there are no estimates, no smoothing, and no synthetic candles. The chart is downsampled to 600 points for rendering, but always keeps the peak, last-seen, and current points **when they fall inside the selected window** so no marker silently disappears. A backtest can resolve the last-seen date from full history when the window misses it (the S&P's 2009 low was last traded in 1996) — the legend then says so instead of pointing at a dot that isn't there.

Ticker and range live in the URL (`?ticker=NVDA&range=MAX`), so a view is shareable — the Share button copies the current link.

## Backtesting a date

Pick a **Backtest as of** date (or use a preset: Lehman '08, GFC,
COVID, tariff, Iran '26) to replay history: every stat is recalculated as if that day were
today. E.g. `^GSPC` with `MAX` as of `2008-12-31` shows the S&P down ~38% from
its Oct-2007 peak. While backtesting, ranges whose window can't show the crash
are locked out for that date — a window must hold both the pre-crash peak and
the last time it traded that low (GFC offers Max only, since $676 last traded
in 1996). When the window holds the peak but misses the low, the date is still
found in full history rather than reporting "Never". The date picker caps at today, weekends resolve to the
previous close (shown next to the badge), and the backtest date is part of the
URL (`?ticker=^GSPC&range=MAX&asof=2008-12-31`) so results stay shareable.

## API

```
GET /api/quote?ticker=^GSPC&range=5Y
```

Returns the drawdown stats plus a downsampled `series` and the pre-downsample `points` count. Two custom behaviours worth knowing:

- **Validation before upstream.** Tickers are normalised to upper case and matched against `/^\^?[A-Z0-9][A-Z0-9.\-=]{0,11}$/`. Anything else is a `400` rather than a forwarded request.
- **Status mapping.** Only messages about the symbol become client errors: unknown symbols (Yahoo's "No data found, symbol may be delisted") and empty windows return `404`. Upstream timeouts (`10s`) return `504`. Everything else — DNS failures, connection resets, unparseable responses — returns `502`, so an outage is never reported as the caller's fault.

Responses carry `X-Cache: HIT|MISS`. The server keeps a bounded in-memory LRU (200 entries, 1 hour TTL) and sets `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`. Backtests always download full history, so that fetch gets a second, smaller cache keyed on `ticker + asOf` (range-independent) — otherwise toggling `3Y → MAX → 5Y` re-downloaded the same ~14k bars three times. Both caches are per-process: with multiple instances each one warms independently.

```jsonc
{
  "ticker": "^GSPC",
  "name": "S&P 500",
  "currency": "USD",
  "range": "5Y",
  "currentPrice": 5832.04,
  "currentDate": "2025-06-13",
  "peakPrice": 6144.15,
  "peakDate": "2025-02-19",
  "drawdownPct": -0.0508,
  "lastSeenDate": "2024-11-04",
  "lastSeenPrice": 5823.5,
  "calendarDaysLost": 221,
  "tradingDaysLost": 154,
  "daysSincePeak": 114,
  "isAtHigh": false,
  "neverSeenLower": false,
  "series": [{ "date": "2020-06-12", "close": 3041.31 }], // trimmed
  "points": 1258,
}
```

Values above are illustrative.

## Stack

Next.js 16 (App Router, `output: "standalone"`, `cacheComponents`), React 19, Tailwind CSS v4, shadcn/ui components on Radix, Recharts for the chart, `yahoo-finance2` for data, Vitest for tests.

All Yahoo calls happen server-side in the route handler, so the browser never talks to a third party and no API key is needed. Name and currency come from `quoteSummary` and are treated as cosmetic — a failure there never fails the request.

```
src/
├─ app/
│  ├─ api/quote/route.ts   # fetch → calculate → downsample → cache
│  ├─ layout.tsx           # fonts, theme provider, toaster
│  └─ page.tsx             # client container: state, URL sync, abort logic
├─ components/             # TickerForm, StatsCards, DrawdownChart, UI kit
└─ lib/
   ├─ drawdown.ts          # calculateDrawdown + downsample (pure)
   ├─ ranges.ts            # RANGES — single source of truth
   ├─ yahoo.ts             # fetchSeries + normalizeBars (server-side only)
   ├─ lru.ts               # bounded TTL cache shared by both routes
   ├─ errors.ts            # shared no-data message
   ├─ presets.ts           # quick-pick symbols and crash dates
   ├─ format.ts            # fmtPct / fmtPrice / fmtDate / atHighTitle
   └─ utils.ts
```

`src/lib/drawdown.ts` is pure — no React, no network — so the tests drive it directly rather than through a component. The route handler is tested the same way, by calling `GET` with a mocked `fetchSeries`.

## Scripts

```bash
npm run dev        # next dev
npm run build      # next build
npm start          # next start
npm run lint       # eslint
npm run typecheck  # next typegen && tsc --noEmit
npm test           # vitest run
npm run test:watch # vitest
```

## Docker

The image builds on `output: "standalone"` and runs as a non-root user.

```bash
docker build -t drawdown .
docker run --rm -p 3000:3000 drawdown
```

There is no `.env` to fill in: the app only reads public Yahoo Finance data. `.env.example` exists as an optional template for local overrides such as `PORT`.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, tests, and a full production build on Node 20, 22, and 24 for every push to `main` and every pull request. A second job builds the Docker image (cached via GHA, not pushed) to catch Dockerfile regressions.

## Deploying

Any Node host works. Keep it on Node 20+, and prefer the Docker image or `output: "standalone"` output for smaller footprints. Note that serverless platforms need the route handler's Node runtime — it makes outbound HTTPS calls to Yahoo Finance.

**Put it behind a rate limit if it is public.** `/api/quote` accepts any syntactically valid symbol, so a scripted client can walk `AAAA`, `AAAB`, … and make your server the load source against Yahoo. The route validates input (so it cannot be used for injection) and caches aggressively, but nothing throttles a determined caller. A reverse proxy or edge rate limit is the cheapest place to add one.

## Caveats

- Data comes from Yahoo Finance via `yahoo-finance2`, unauthenticated and unofficial. It can lag, gap, or rate-limit. Duplicate and empty bars are dropped before any maths runs, so a partial bar can never become two points on one date.
- `MAX` on very liquid tickers returns tens of thousands of daily closes; the first request is slower than later cached ones.
- Drawdown is measured against the highest close _in the selected range_, so the same ticker at `1Y` and `MAX` can report different peaks — that is intended, and stated in the footer.

Not financial advice.
