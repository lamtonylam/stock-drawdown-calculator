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
  return `${n.toLocaleString()} day${n === 1 ? "" : "s"}`;
}
