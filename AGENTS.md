<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Drawdown Time Machine

Stock drawdown calculator (Next.js App Router). Given a ticker, it shows how far
the price has fallen from its peak and the most recent pre-peak date when it
last traded this low ("time-machine date"), plus calendar/trading days of gains
wiped out. Default ticker `^GSPC` (S&P 500).

## Stack

- Next.js 16 (App Router, `output: "standalone"`, `cacheComponents`), React 19
- Tailwind CSS v4, shadcn/ui on Radix, Recharts, `sonner` toasts
- `yahoo-finance2` for market data (server-side only, no API key)
- Vitest for tests, ESLint + Prettier, TypeScript strict

## Commands

```bash
npm install
npm run dev          # next dev → http://localhost:3000
npm run build        # production build
npm start            # serve production build
npm run lint         # eslint
npm run lint:fix     # eslint --fix
npm run format       # prettier --write .
npm run format:check # prettier --check .
npm run typecheck    # next typegen && tsc --noEmit
npm test             # vitest run
npm run test:watch   # vitest (watch)
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, and a production
build on Node 20/22/24 for pushes to `main` and PRs, plus a Docker build check.

No `.env` needed — the app only reads public Yahoo Finance data. `.env.example`
is an optional template (e.g. `PORT`).

## Structure

```
src/
├─ app/
│  ├─ api/quote/route.ts    # fetch → calculate → downsample → cache (tested)
│  ├─ api/quote/route.test.ts
│  ├─ api/search/route.ts   # symbol autocomplete, quotes-only (cached)
│  ├─ layout.tsx            # fonts, theme provider, toaster
│  └─ page.tsx              # client container: state, URL sync, abort logic
├─ components/
│  ├─ TickerForm.tsx        # search box, range toggle, backtest date + presets
│  ├─ StatsCards.tsx        # drawdown / time-machine / days-lost cards
│  ├─ DrawdownChart.tsx     # Recharts price history with peak marker
│  └─ ui/                   # shadcn primitives (don't hand-edit blindly)
└─ lib/
   ├─ drawdown.ts           # calculateDrawdown + downsample + findLastSeenBefore (PURE)
   ├─ drawdown.test.ts
   ├─ ranges.ts             # RANGES + period1ForRange (single source of truth)
   ├─ asof.ts               # parseAsOf / dayAfterAsOf / MIN_ASOF (shared client+server)
   ├─ asof.test.ts
   ├─ yahoo.ts              # fetchSeries + normalizeBars + searchSymbols (server-side only)
   ├─ yahoo.test.ts
   ├─ lru.ts                # createLru — the ONE cache implementation (both routes)
   ├─ errors.ts             # noDataMessage — wording both layers must agree on
   ├─ presets.ts            # PRESETS + BACKTEST_PRESETS (data, not component state)
   ├─ format.ts             # fmtPct / fmtPrice / fmtDate / atHighTitle
   ├─ names.ts              # friendlyName / friendlyExchange
   └─ utils.ts
```

Path alias: `@/*` → `./src/*` (mirrored in both `tsconfig.json` and
`vitest.config.mts` so tests import the same way the app does).

## Conventions & gotchas

- **Next.js 16 is breaking.** Read `node_modules/next/dist/docs/` before
  writing framework code; do not rely on training data.
- **`src/lib/ranges.ts` is the single source of truth** for selectable ranges
  (`1Y`, `3Y`, `5Y`, `MAX`, default `5Y`) **and** for window starts via
  `period1ForRange(range, asOf)`. Server (route + Yahoo layer) and client
  (form + page) both import it — never hard-code a range list or a
  days-ago calculation elsewhere. Live mode anchors at today; backtest mode
  anchors at `asOf` (a 1Y window ending 2008 must start in 2007, or Yahoo
  rejects it as start-after-end).
- **All ranges use daily bars**, including `MAX` (back to 1970-01-01). Do not
  switch `MAX` to weekly bars: it silently redefines "trading days" as weeks
  and moves the peak to a weekly close.
- **`src/lib/drawdown.ts` is pure** (no React, no network). Test it directly,
  not through a component. Core semantics:
  - `peak` = max close **in the selected range** (so 1Y vs MAX can differ —
    intended, stated in the footer).
  - `current` = last close in the series; adjusted closes (splits/dividends).
  - `lastSeen` = most recent date **before the peak** with close ≤ current,
    via `findLastSeenBefore` (order-independent, reused for the full-history
    fallback).
  - `neverSeenLower` when no pre-peak close was that low.
- **`downsample(series, 600, [peakDate, lastSeenDate, currentDate])`** must
  always keep the marker dates plus first/last points, or chart markers
  silently vanish on long series. Note the one case it _cannot_ honour: a
  backtest whose `lastSeenDate` comes from the full-history fallback can sit
  **outside** `sliced`, so it is not in `series` at all. `DrawdownChart` must
  then say "before this window" instead of drawing a legend swatch for a dot
  that isn't there — never render a legend from `lastSeenDate` alone, always
  from the point resolved in `series`.
- **`src/lib/asof.ts` is shared** by client (`page.tsx` URL parsing) and
  server (route validation). `parseAsOf` treats empty as live (never an
  error); non-`YYYY-MM-DD`, non-real dates, `< 1970-01-01`, or future dates
  are `400`s. `dayAfterAsOf` exists because Yahoo's `period2` is exclusive.
- **Quote route (`api/quote/route.ts`) patterns** — keep them together:
  - Validate before hitting upstream: upper-case, `12`-char max,
    `/^\^?[A-Z0-9][A-Z0-9.\-=]{0,11}$/`, else `400`.
  - Backtest (`asof` query param): `fetchSeries` passes an exclusive
    `period2` to Yahoo _and_ caps defensively, and the route re-slices
    (covers cached/mocked series). Cache key includes asOf
    (`ticker:range:asof|live`); payload echoes `asOf: string | null` and
    `currentDate` becomes the last close ≤ `asOf`.
  - Backtests always fetch **full (`MAX`) history**, then slice the requested
    window via `period1ForRange(range, asOf)`. The stats keep the window's
    contract, but `validRanges` and the last-seen fallback need the whole past.
  - `validRanges`: per backtest date, the windows that contain **both** the
    all-time peak and a last-seen date (`calculateDrawdown` per window;
    `MAX` always included). The client disables the rest and auto-refetches
    the first valid range when the current one is locked out.
  - Full-history fallback: when the window holds the peak but misses the
    low (e.g. GFC on 3Y — $676 last traded in 1996), `findLastSeenBefore`
    runs on full history instead of reporting a false "Never". That date can
    be **outside** `sliced`, so it will not be in `series` — the chart legend
    must disclose it rather than imply a marker (see the downsample bullet).
  - Status mapping: only **symbol-specific** messages become a `404`
    (`no data found`, `not enough data`, `delisted`, `invalid symbol`,
    `status 400|404`). Timeout/abort → `504`. Everything else → `502`,
    so a DNS failure ("host not found") is never reported as bad input.
    The no-data wording lives in `src/lib/errors.ts` (`noDataMessage`) so the
    Yahoo layer and the route cannot drift apart.
  - Bounded in-memory LRU (200 entries, 1h TTL), `X-Cache: HIT|MISS`,
    `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`.
  - A second, smaller LRU (`historyCache`, 8 entries) holds the full history
    of a backtest keyed on `ticker:asOf` only — it does not depend on `range`,
    so `3Y → MAX → 5Y` on one date fetches Yahoo once. It is small on purpose:
    each entry is a whole history (~1-2 MB for a long index series).
  - Both caches are exported (`quoteCache`, `historyCache`) and cleared in
    `beforeEach` — module-level state must not leak between tests.
  - `quoteSummary` (name/currency) is cosmetic — never fail the request over it.
  - Response shape: drawdown stats + `validRanges` + downsampled `series` +
    pre-downsample `points` count.
- **Search route (`api/search/route.ts`) patterns:**
  - Query validated against `/^[A-Z0-9 .&'\-/^=]{1,60}$/i`, else `400`.
  - `searchSymbols` asks Yahoo for 15 quotes / 0 news, filters to real
    symbols, maps via `friendlyExchange`, returns max 8.
  - Bounded LRU (200 entries, 10m TTL), `X-Cache: HIT|MISS`,
    `Cache-Control: public, s-maxage=120, stale-while-revalidate=600`
    (client still fetches with `cache: "no-store"` — Yahoo ranking is flaky
    and thin responses must never stick). Upstream timeout 8s → `504`.
  - Use `createLru` from `src/lib/lru.ts` — do not hand-roll another cache.
    `searchCache` is exported for the same test-reset reason.
- **Client (`app/page.tsx`) patterns:**
  - Ticker + range + asof live in the URL
    (`?ticker=NVDA&range=MAX&asof=2008-12-31`); Share button copies the link.
    Keep URL sync in `fetchData`.
  - Abort in-flight fetches on a new request/unmount (15s client timeout);
    a superseded request must stay silent and never overwrite newer state.
  - No `setState` synchronously in effect bodies; defer kick-off to a task
    so StrictMode double-mount stays safe and hydration matches the server.
  - Backtest badge shows requested date vs resolved trading day (weekends
    resolve to the previous close); `validRanges` from the payload gates the
    toggle, with one auto-refetch when locked out.
- **`TickerForm` search patterns:** 250ms debounce, min 2 chars,
  `cache: "no-store"`, `searchSeq` guard so slow keystrokes can't overwrite
  newer results, `typedRef` to distinguish typing from parent-driven updates,
  Enter prefers the top suggestion. The lookup is aborted on every keystroke
  and after 8s, and the cleanup **increments `searchSeq` before aborting** —
  otherwise the abort rejection looks like a live failure and blanks the
  dropdown on each keypress. Backtest date picker caps at today, plus
  one-click crash presets from `src/lib/presets.ts`; range buttons lock out
  per `validRanges`.
- **Range-scoped copy must stay range-scoped.** `isAtHigh` compares the
  current close with the peak _in the selected range_, so only `MAX` can say
  "all-time high". Use `atHighTitle(ticker, range)` from `lib/format.ts`
  rather than inlining the wording.
- **Tests:** Vitest, `src/**/*.test.{ts,tsx}`, `environment: "node"`. Test the
  route handler by calling `GET` with a mocked `fetchSeries`, not via HTTP.
- **Data caveats:** Yahoo data is unauthenticated/unofficial — can lag, gap,
  or rate-limit. `normalizeBars` drops empty and duplicate dates before any
  maths runs (a partial bar beside the settled one used to become two points
  on one date and inflate `tradingDaysLost`). `MAX` on liquid tickers returns
  tens of thousands of closes; first request is slow, later ones hit cache.
  Not financial advice.

## Docker / deploy

Builds on `output: "standalone"`, runs as non-root:

```bash
docker build -t drawdown .
docker run --rm -p 3000:3000 drawdown
```

Any Node 20+ host works. The route handler needs the Node runtime (outbound
HTTPS to Yahoo) — plain static/serverless-edge hosting won't do.
