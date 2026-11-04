import {
  CalendarClockIcon,
  HourglassIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  fmtDate,
  fmtDays,
  fmtPct,
  fmtPrice,
  fmtTradingSessions,
} from "@/lib/format";

export interface Stats {
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number;
  currentDate: string;
  peakPrice: number;
  peakDate: string;
  drawdownPct: number;
  lastSeenDate: string | null;
  lastSeenPrice: number | null;
  calendarDaysLost: number | null;
  tradingDaysLost: number | null;
  daysSincePeak: number | null;
  isAtHigh: boolean;
  neverSeenLower: boolean;
}

function StatCard({
  label,
  icon,
  value,
  sub,
  featured,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  value?: string;
  sub?: string;
  featured?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card
      className={
        featured
          ? "gap-2 bg-primary text-primary-foreground ring-primary/40"
          : "gap-2"
      }
    >
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[11px] font-medium tracking-[0.12em] uppercase ${
              featured ? "text-primary-foreground/60" : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
          <span
            className={
              featured
                ? "text-primary-foreground/50"
                : "text-muted-foreground/60"
            }
          >
            {icon}
          </span>
        </div>
        {value !== undefined && (
          <div className="font-mono text-2xl leading-none font-semibold tracking-tight tabular-nums">
            {value}
          </div>
        )}
        {children}
        {sub && (
          <div
            className={`text-xs leading-relaxed ${
              featured ? "text-primary-foreground/60" : "text-muted-foreground"
            }`}
          >
            {sub}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StatsCards({ stats }: { stats: Stats }) {
  if (stats.isAtHigh) {
    return (
      <Card className="gap-0 border-emerald-500/30 bg-emerald-500/5 ring-emerald-500/25">
        <CardContent className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <TrendingUpIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {stats.ticker} is at an all-time high
            </p>
            <p className="mt-0.5 text-xs text-emerald-700/70 dark:text-emerald-300/70">
              {fmtPrice(stats.currentPrice, stats.currency)} on{" "}
              {fmtDate(stats.currentDate)} — no gains lost in this range.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Drawdown"
          icon={<TrendingDownIcon className="size-4" />}
          value={fmtPct(stats.drawdownPct)}
          sub={`${fmtPrice(stats.peakPrice, stats.currency)} → ${fmtPrice(stats.currentPrice, stats.currency)}`}
        />
        <StatCard
          label="Time-machine date"
          icon={<CalendarClockIcon className="size-4" />}
          featured
          value={stats.lastSeenDate ? fmtDate(stats.lastSeenDate) : "Never"}
          sub={
            stats.lastSeenPrice != null
              ? `Last time it traded at ${fmtPrice(stats.lastSeenPrice, stats.currency)}`
              : "Below every close before the peak"
          }
        />
        <StatCard
          label="Gains wiped out"
          icon={<HourglassIcon className="size-4" />}
          value={fmtDays(stats.calendarDaysLost)}
          sub={
            stats.tradingDaysLost != null
              ? stats.calendarDaysLost != null && stats.calendarDaysLost >= 365
                ? `${stats.calendarDaysLost.toLocaleString()} days · ${fmtTradingSessions(stats.tradingDaysLost)} of progress`
                : `${fmtTradingSessions(stats.tradingDaysLost)} of progress`
              : undefined
          }
        />
      </div>

      <Card className="gap-0 py-0">
        <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-xs text-muted-foreground">Peak close</span>
            <span className="text-right">
              <span className="font-mono text-sm font-medium tabular-nums">
                {fmtPrice(stats.peakPrice, stats.currency)}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {fmtDate(stats.peakDate)}
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-xs text-muted-foreground">Latest close</span>
            <span className="text-right">
              <span className="font-mono text-sm font-medium tabular-nums">
                {fmtPrice(stats.currentPrice, stats.currency)}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {fmtDate(stats.currentDate)}
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Days since peak
            </span>
            <span className="text-right">
              <span className="font-mono text-sm font-medium tabular-nums">
                {fmtDays(stats.daysSincePeak)}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                since {fmtDate(stats.peakDate)}
              </span>
            </span>
          </div>
        </div>
      </Card>

      {stats.neverSeenLower && (
        <p className="text-xs text-muted-foreground">
          No close before the peak was this low — the time machine has nowhere
          to go back to.
        </p>
      )}
    </div>
  );
}
