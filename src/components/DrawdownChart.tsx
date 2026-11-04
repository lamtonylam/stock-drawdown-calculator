"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtDate, fmtPct, fmtPrice } from "@/lib/format";
import type { PricePoint } from "@/lib/drawdown";

type TooltipItem = { payload?: { date?: string; close?: number } };

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function ChartTooltip({
  active,
  payload,
  currency,
  peakPrice,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  currency: string;
  peakPrice: number;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point?.date || typeof point.close !== "number") return null;
  const fromPeak = (point.close - peakPrice) / peakPrice;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {fmtDate(point.date)}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold tabular-nums">
        {fmtPrice(point.close, currency)}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
        {fmtPct(fromPeak)} from peak
      </div>
    </div>
  );
}

function formatTick(iso: string): string {
  // YYYY-MM-DD -> "Mar '24"
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} '${y.slice(2)}`;
}

function LegendDot({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {children}
    </span>
  );
}

export function DrawdownChart({
  series,
  peakDate,
  peakPrice,
  lastSeenDate,
  currentDate,
  currency,
}: {
  series: PricePoint[];
  peakDate: string;
  peakPrice: number;
  lastSeenDate: string | null;
  currentDate: string;
  currency: string;
}) {
  const peak = series.find((p) => p.date === peakDate);
  const last = lastSeenDate
    ? series.find((p) => p.date === lastSeenDate)
    : undefined;
  const current = series[series.length - 1];

  const values = series.map((p) => p.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.1 || 1;
  const first = series[0];

  // The SVG is opaque to assistive tech; give it one sentence of the same
  // information a sighted user gets from the three markers.
  const summary = first
    ? `Price history from ${fmtDate(first.date)} to ${fmtDate(currentDate)}. ` +
      `Peak ${fmtPrice(peakPrice, currency)} on ${fmtDate(peakDate)}, ` +
      `latest ${fmtPrice(current?.close ?? peakPrice, currency)}.`
    : "Price history";

  return (
    <div className="flex flex-col gap-3">
      <div
        className="h-[300px] w-full sm:h-[360px]"
        role="img"
        aria-label={summary}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={series}
            margin={{ top: 16, right: 22, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="fillClose" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--chart-fill)"
                  stopOpacity={0.35}
                />
                <stop
                  offset="70%"
                  stopColor="var(--chart-fill)"
                  stopOpacity={0.04}
                />
                <stop
                  offset="100%"
                  stopColor="var(--chart-fill)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke="var(--chart-grid)"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v: string) => formatTick(v)}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              minTickGap={48}
              dy={4}
            />
            <YAxis
              domain={[min - pad, max + pad]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v: number) =>
                v.toLocaleString("en-US", { maximumFractionDigits: 0 })
              }
              tickLine={false}
              axisLine={false}
              width={58}
            />
            <Tooltip
              cursor={{
                stroke: "var(--muted-foreground)",
                strokeDasharray: "4 4",
              }}
              content={
                <ChartTooltip currency={currency} peakPrice={peakPrice} />
              }
            />
            <ReferenceLine
              y={peakPrice}
              stroke="var(--chart-peak)"
              strokeDasharray="4 4"
              strokeOpacity={0.45}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke="var(--chart-line)"
              strokeWidth={1.8}
              fill="url(#fillClose)"
              activeDot={{ r: 4, strokeWidth: 0, fill: "var(--chart-line)" }}
              dot={false}
              isAnimationActive={false}
            />
            {peak && (
              <ReferenceDot
                x={peak.date}
                y={peak.close}
                r={4.5}
                fill="var(--chart-peak)"
                stroke="var(--background)"
                strokeWidth={2}
              />
            )}
            {last && (
              <ReferenceDot
                x={last.date}
                y={last.close}
                r={4.5}
                fill="var(--chart-last)"
                stroke="var(--background)"
                strokeWidth={2}
              />
            )}
            {current && (
              <ReferenceDot
                x={current.date}
                y={current.close}
                r={4.5}
                fill="var(--chart-now)"
                stroke="var(--background)"
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <LegendDot color="var(--chart-peak)">
          Peak {fmtPrice(peakPrice, currency)}
        </LegendDot>
        {/*
         * Only promise a marker that is actually drawn. A backtest can resolve
         * the last-seen date from full history when the window misses it (GFC
         * on 3Y: $676 last traded in 1996), and that point is not in `series`.
         * A dot swatch for it was a lie — say where it sits instead.
         */}
        {last ? (
          <LegendDot color="var(--chart-last)">
            Last seen {fmtDate(last.date)}
          </LegendDot>
        ) : (
          lastSeenDate && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-full border border-muted-foreground/60"
                aria-hidden
              />
              Last seen {fmtDate(lastSeenDate)} — before this window
            </span>
          )
        )}
        <LegendDot color="var(--chart-now)">
          Now {fmtDate(currentDate)}
        </LegendDot>
      </div>
    </div>
  );
}
