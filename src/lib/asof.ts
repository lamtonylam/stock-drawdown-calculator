/**
 * Backtest "as of" date — lets the drawdown calculation pretend today is a
 * past date (e.g. 2008-12-31) so losses during a historical crash can be
 * inspected. Empty string / null means live (no backtest).
 */

export const MIN_ASOF = "1970-01-01";

const ASOF_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ParsedAsOf {
  /** Normalized YYYY-MM-DD, or null for live mode. */
  asOf: string | null;
  /** Human-readable reason when the value is unusable, else null. */
  error: string | null;
}

/**
 * Validate the raw `asOf`/`asof` query or form value.
 * Empty means live — never an error, so clearing the date picker just works.
 */
export function parseAsOf(raw: string | null | undefined): ParsedAsOf {
  const v = (raw ?? "").trim();
  if (!v) return { asOf: null, error: null };
  if (!ASOF_RE.test(v)) {
    return { asOf: null, error: "Backtest date must be YYYY-MM-DD" };
  }
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return { asOf: null, error: `Backtest date ${v} is not a real date` };
  }
  if (v < MIN_ASOF) {
    return {
      asOf: null,
      error: `Backtest date must be on or after ${MIN_ASOF}`,
    };
  }
  if (v > todayISO()) {
    return { asOf: null, error: "Backtest date cannot be in the future" };
  }
  return { asOf: v, error: null };
}

/** Day after `asOf` (YYYY-MM-DD) — Yahoo's `period2` is exclusive. */
export function dayAfterAsOf(asOf: string): string {
  const [y, m, d] = asOf.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
