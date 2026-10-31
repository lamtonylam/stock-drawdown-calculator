export interface PricePoint {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface DrawdownResult {
  currentPrice: number;
  currentDate: string;
  peakPrice: number;
  peakDate: string;
  drawdownPct: number; // e.g. -0.095 for -9.5%
  lastSeenDate: string | null;
  lastSeenPrice: number | null;
  calendarDaysLost: number | null;
  tradingDaysLost: number | null;
  daysSincePeak: number | null;
  isAtHigh: boolean;
  neverSeenLower: boolean;
}

function daysBetween(a: string, b: string): number {
  const ms =
    new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Core drawdown "time machine" calculation.
 * - peak = max close in series
 * - current = last close in series
 * - lastSeen = most recent date BEFORE peak where close <= current
 */
export function calculateDrawdown(series: PricePoint[]): DrawdownResult {
  if (series.length === 0) throw new Error("Empty price series");

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted[sorted.length - 1];

  let peak = sorted[0];
  for (const p of sorted) {
    if (p.close > peak.close) peak = p;
  }

  const drawdownPct = (current.close - peak.close) / peak.close;
  const isAtHigh =
    current.date === peak.date || Math.abs(drawdownPct) < 1e-9;

  if (isAtHigh) {
    return {
      currentPrice: current.close,
      currentDate: current.date,
      peakPrice: peak.close,
      peakDate: peak.date,
      drawdownPct: 0,
      lastSeenDate: current.date,
      lastSeenPrice: current.close,
      calendarDaysLost: 0,
      tradingDaysLost: 0,
      daysSincePeak: 0,
      isAtHigh: true,
      neverSeenLower: false,
    };
  }

  // Walk backwards from peak to find last date with close <= current
  const beforePeak = sorted.filter((p) => p.date < peak.date);
  let lastSeen: PricePoint | null = null;
  for (let i = beforePeak.length - 1; i >= 0; i--) {
    if (beforePeak[i].close <= current.close) {
      lastSeen = beforePeak[i];
      break;
    }
  }

  if (!lastSeen) {
    return {
      currentPrice: current.close,
      currentDate: current.date,
      peakPrice: peak.close,
      peakDate: peak.date,
      drawdownPct,
      lastSeenDate: null,
      lastSeenPrice: null,
      calendarDaysLost: null,
      tradingDaysLost: null,
      daysSincePeak: daysBetween(peak.date, current.date),
      isAtHigh: false,
      neverSeenLower: true,
    };
  }

  // Count trading days between lastSeen and current (exclusive of lastSeen)
  const idxSeen = sorted.findIndex((p) => p.date === lastSeen!.date);
  const tradingDaysLost = sorted.length - 1 - idxSeen;

  return {
    currentPrice: current.close,
    currentDate: current.date,
    peakPrice: peak.close,
    peakDate: peak.date,
    drawdownPct,
    lastSeenDate: lastSeen.date,
    lastSeenPrice: lastSeen.close,
    calendarDaysLost: daysBetween(lastSeen.date, current.date),
    tradingDaysLost,
    daysSincePeak: daysBetween(peak.date, current.date),
    isAtHigh: false,
    neverSeenLower: false,
  };
}

/**
 * Downsample for chart rendering.
 *
 * Strides through the series, but always keeps the first and last point **and**
 * every date in `keep`. Without that, the peak and last-seen markers can fall
 * between stride steps and silently vanish from the chart (the series is long
 * enough that this happens for roughly half of all tickers).
 *
 * Expects `series` sorted ascending by date. May return slightly more than
 * `maxPoints` items — at most `keep.length + 2` extra.
 */
export function downsample(
  series: PricePoint[],
  maxPoints = 500,
  keep: (string | null | undefined)[] = []
): PricePoint[] {
  if (series.length <= maxPoints) return series;

  const keepDates = new Set(keep.filter((d): d is string => typeof d === "string"));
  const picked = new Set<number>();
  const step = series.length / maxPoints;

  for (let i = 0; i < series.length; i += step) {
    picked.add(Math.floor(i));
  }
  picked.add(series.length - 1);

  if (keepDates.size > 0) {
    for (let i = 0; i < series.length; i++) {
      if (keepDates.has(series[i].date)) picked.add(i);
    }
  }

  return [...picked].sort((a, b) => a - b).map((i) => series[i]);
}
