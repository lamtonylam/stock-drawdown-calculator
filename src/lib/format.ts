export function fmtPct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

export function fmtPrice(x: number, currency?: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: currency ? "currency" : "decimal",
      currency: currency ?? undefined,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(x);
  } catch {
    return x.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  // A malformed date from a corrupt series should degrade, not render
  // "Invalid Date" in the middle of a stat card.
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtDays(n: number | null): string {
  if (n == null) return "—";
  if (n < 365) return `${n.toLocaleString()} day${n === 1 ? "" : "s"}`;
  const years = n / 365.25;
  const rounded = years.toFixed(1).replace(/\.0$/, "");
  return `${rounded} year${rounded === "1" ? "" : "s"}`;
}

/** Trading sessions: exact count, with a year approximation past one year. */
export function fmtTradingSessions(n: number | null): string {
  if (n == null) return "—";
  const exact = `${n.toLocaleString()} session${n === 1 ? "" : "s"}`;
  if (n < 365) return exact;
  const years = (n / 252).toFixed(1).replace(/\.0$/, "");
  return `${exact} (~${years}y)`;
}

/**
 * Headline for the "at high" card.
 *
 * `isAtHigh` compares the current close with the peak **inside the selected
 * range** (see `calculateDrawdown`), so only `MAX` justifies the words
 * "all-time high". A 1Y window can top out well below the real record, and the
 * old copy claimed one anyway.
 */
export function atHighTitle(ticker: string, range: string): string {
  return range === "MAX"
    ? `${ticker} is at an all-time high`
    : `${ticker} is at its highest close in ${range}`;
}
