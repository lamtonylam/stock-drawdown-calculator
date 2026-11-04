/**
 * Single source of truth for the selectable ranges.
 *
 * Shared by the server (route + Yahoo layer) and the client (form + page), so
 * the toggle group and the API can never drift apart.
 */
export const RANGES = ["1Y", "3Y", "5Y", "MAX"] as const;

export type RangeKey = (typeof RANGES)[number];

export const DEFAULT_RANGE: RangeKey = "5Y";

export function isRangeKey(value: string): value is RangeKey {
  return (RANGES as readonly string[]).includes(value);
}

/** Window spans in days — `MAX` is open-ended, so it is absent here. */
const RANGE_SPAN_DAYS: Record<Exclude<RangeKey, "MAX">, number> = {
  "1Y": 365,
  "3Y": 1095,
  "5Y": 1825,
};

/** Start of the window ending at `asOf` (YYYY-MM-DD), going back `n` days. */
export function daysBeforeAsOf(asOf: string, n: number): string {
  const [y, m, d] = asOf.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

/** Days back from today — evaluated at call time, never frozen at import. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * `period1` for the Yahoo query. Live mode anchors at today; backtesting
 * anchors at `asOf` — otherwise a 1Y window starting "a year ago today"
 * lands after a 2008 `period2` and Yahoo rejects it as start-after-end.
 */
export function period1ForRange(range: RangeKey, asOf?: string | null): string {
  if (range === "MAX") return "1970-01-01";
  const span = RANGE_SPAN_DAYS[range] ?? RANGE_SPAN_DAYS["5Y"];
  return asOf ? daysBeforeAsOf(asOf, span) : daysAgo(span);
}
