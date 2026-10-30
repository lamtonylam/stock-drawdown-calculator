# Drawdown Time Machine

How far has a ticker fallen from its peak — and **when did it last trade this low?**

Most drawdown charts tell you the percentage. This one also tells you the *date*: the most recent trading day, before the peak, when the price was at or below today's price. The gap between that day and today is how much progress the decline erased.

Default ticker is `^GSPC` (S&P 500). Works with anything Yahoo Finance serves: `^NDX`, `^DJI`, `AAPL`, `NVDA`, `BTC-USD`, `EURUSD=X`, `005930.KS`, …

```bash
npm install
npm run dev
# → http://localhost:3000
```

## What it shows

| Stat | Meaning |
| --- | --- |
| Drawdown | `(current − peak) / peak`, from adjusted daily closes |
| Last seen this low | Most recent close **before the peak** that was ≤ today's price |
| Calendar days lost | Days between that date and today |
| Trading days lost | Same span counted in closes in the series |
| Underwater days | Calendar days since the peak |
| Peak / current | Prices and dates behind the numbers |

Selectable ranges are `1Y`, `2Y`, `5Y`, `MAX` (default `5Y`). All ranges use **daily** bars; `MAX` goes back to 1970. Values are split- and dividend-adjusted closes, so there are no estimates, no smoothing, and no synthetic candles. The chart is downsampled to 600 points for rendering, but always keeps the peak, last-seen, and current points so no marker silently disappears.

Ticker and range live in the URL (`?ticker=NVDA&range=MAX`), so a view is shareable — the Share button copies the current link.

## API

```
GET /api/quote?ticker=^GSPC&range=5Y
```

Returns the drawdown stats plus a downsampled `series` and the pre-downsample `points` count. Two custom behaviours worth knowing:

- **Validation before upstream.** Tickers are normalised to upper case and matched against `/^\^?[A-Z0-9][A-Z0-9.\-=]{0,11}$/`. Anything else is a `400` rather than a forwarded request.
- **Status mapping.** Unknown symbols (Yahoo's "No data found, symbol may be delisted") return `404`, upstream timeouts (`10s`) return `504`, everything else `502`.

Responses carry `X-Cache: HIT|MISS`. The server keeps a bounded in-memory LRU (200 entries, 1 hour TTL) and sets `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`. That cache is per-process — with multiple instances each one warms independently.

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
  "underwaterDays": 114,
  "isAtHigh": false,
  "neverSeenLower": false,
  "series": [{ "date": "2020-06-12", "close": 3041.31 }], // trimmed
  "points": 1258
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
   ├─ yahoo.ts             # adjusted-close fetcher
   ├─ format.ts            # fmtPct / fmtPrice / fmtDate / fmtDays
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

## Caveats

- Data comes from Yahoo Finance via `yahoo-finance2`, unauthenticated and unofficial. It can lag, gap, or rate-limit.
- `MAX` on very liquid tickers returns tens of thousands of daily closes; the first request is slower than later cached ones.
- Drawdown is measured against the highest close *in the selected range*, so the same ticker at `1Y` and `MAX` can report different peaks — that is intended, and stated in the footer.

Not financial advice.
