/**
 * Quick-pick data for `TickerForm`.
 *
 * Lives here rather than inline in the component so the lists are testable and
 * a wrong date or a dead symbol is caught by the suite instead of by a user.
 */

/** One-click symbols; labels come from `friendlyName` at the call site. */
export const PRESETS = [
  "^GSPC",
  "^NDX",
  "^DJI",
  "AAPL",
  "NVDA",
  "BTC-USD",
] as const;

/**
 * One-click dates for replaying a crash. Chronological, so the row reads as a
 * timeline, and every date must be a real past day (`YYYY-MM-DD`) — the API
 * rejects anything else with a 400.
 */
export const BACKTEST_PRESETS = [
  { label: "Lehman '08", date: "2008-09-15" },
  { label: "GFC", date: "2009-03-09" },
  { label: "COVID", date: "2020-03-23" },
  { label: "Tariff", date: "2025-04-08" },
  { label: "Iran war", date: "2025-06-20" },
] as const;
