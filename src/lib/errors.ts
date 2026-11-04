/**
 * Wording shared by the Yahoo layer (where "no usable bars" is first detected)
 * and the quote route (where a window slice can also come up empty).
 *
 * Both must produce the same message, because `statusForUpstreamError` maps it
 * to a `404`: an empty window for a valid symbol is a bad request, not an
 * upstream outage, and it must not inflate the 5xx rate.
 */
export function noDataMessage(ticker: string, asOf: string | null): string {
  return asOf
    ? `Not enough data for ${ticker} on or before ${asOf}`
    : `Not enough data for ${ticker} (check symbol)`;
}
