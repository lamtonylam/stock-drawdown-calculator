/**
 * Single source of truth for the selectable ranges.
 *
 * Shared by the server (route + Yahoo layer) and the client (form + page), so
 * the toggle group and the API can never drift apart.
 */
export const RANGES = ["1Y", "2Y", "5Y", "MAX"] as const;

export type RangeKey = (typeof RANGES)[number];

export const DEFAULT_RANGE: RangeKey = "5Y";

export function isRangeKey(value: string): value is RangeKey {
  return (RANGES as readonly string[]).includes(value);
}
