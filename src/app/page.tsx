"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  InfoIcon,
  LinkIcon,
  TrendingDownIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { DrawdownChart } from "@/components/DrawdownChart";
import { StatsCards, type Stats } from "@/components/StatsCards";
import { ThemeToggle } from "@/components/theme-toggle";
import { TickerForm } from "@/components/TickerForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PricePoint } from "@/lib/drawdown";
import { fmtDate, fmtPct } from "@/lib/format";
import { friendlyName } from "@/lib/names";
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from "@/lib/ranges";

const REQUEST_TIMEOUT_MS = 15_000;

interface ApiResponse extends Stats {
  range: string;
  series: PricePoint[];
  points: number;
}

function initialFromUrl(): { t: string; r: RangeKey } {
  if (typeof window === "undefined") return { t: "^GSPC", r: DEFAULT_RANGE };
  const params = new URLSearchParams(window.location.search);
  const t = params.get("ticker") || "^GSPC";
  const raw = (params.get("range") ?? DEFAULT_RANGE).toUpperCase();
  return { t, r: isRangeKey(raw) ? raw : DEFAULT_RANGE };
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[76px] rounded-xl" />
      <Skeleton className="h-[300px] rounded-xl sm:h-[360px]" />
    </div>
  );
}

export default function Home() {
  const [ticker, setTicker] = useState("^GSPC");
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [draft, setDraft] = useState("^GSPC");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (t: string, r: RangeKey) => {
    // Cancel the previous request: a slow 1Y response used to land after a newer
    // MAX one and overwrite both the data and the URL, leaving the toggle and
    // the chart disagreeing. It also cleared the newer request's spinner.
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/quote?ticker=${encodeURIComponent(t)}&range=${r}`,
        { signal: controller.signal }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json as ApiResponse);
      const url = new URL(window.location.href);
      url.searchParams.set("ticker", t);
      url.searchParams.set("range", r);
      window.history.replaceState(null, "", url.toString());
    } catch (e) {
      // A superseded request must stay silent — a newer one owns the UI state.
      if (inFlightRef.current !== controller) return;
      if (timedOut) {
        setError("Request timed out — check your connection and try again");
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      clearTimeout(timer);
      if (inFlightRef.current === controller) {
        inFlightRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  const handleSubmit = useCallback(
    async (t: string, r: RangeKey) => {
      setTicker(t);
      setRange(r);
      setDraft(t);
      await fetchData(t, r);
    },
    [fetchData]
  );

  useEffect(() => {
    // Reading the URL here (rather than during render) keeps the client markup
    // in agreement with the server's — a hydration mismatch otherwise.
    //
    // The kick-off is deferred to a task so the resulting state writes happen
    // in a callback rather than synchronously inside the effect body (which
    // would cascade renders, and trips react-hooks/set-state-in-effect). The
    // timer also means an immediate unmount cancels cleanly — there is no
    // "already initialised" ref, so dev StrictMode's second mount still fires.
    const { t, r } = initialFromUrl();
    const timer = setTimeout(() => void handleSubmit(t, r), 0);
    return () => {
      clearTimeout(timer);
      inFlightRef.current?.abort();
    };
  }, [handleSubmit]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const showSkeleton = !data && !error;

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--foreground)_7%,transparent),transparent_65%)]"
      />

      <main className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
        <div role="status" aria-live="polite" className="sr-only">
          {loading
            ? `Loading ${friendlyName(ticker)} data`
            : error
              ? `Could not load ${friendlyName(ticker)}: ${error}`
              : data
                ? `${data.name}: ${fmtPct(data.drawdownPct)} from its peak on ${fmtDate(data.peakDate)}`
                : ""}
        </div>
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <TrendingDownIcon className="size-5" />
              </span>
              <div>
                <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                  Market drawdown
                </p>
                <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                  Drawdown Time Machine
                </h1>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <ThemeToggle />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={share}>
                    <LinkIcon data-icon="inline-start" />
                    Share
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy a link to this view</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            How far has{" "}
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
              {friendlyName(ticker)}
            </span>{" "}
            fallen from its peak — and when did it last trade this low? That gap
            is how many days of gains were wiped out.
          </p>
        </header>

        <Card className="gap-0 overflow-visible shadow-sm">
          <CardContent>
            <TickerForm
              ticker={ticker}
              range={range}
              draft={draft}
              onDraftChange={setDraft}
              loading={loading}
              onSubmit={handleSubmit}
            />
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive" className="bg-card">
            <TriangleAlertIcon />
            <AlertTitle>Couldn&apos;t load {friendlyName(ticker)}</AlertTitle>
            <AlertDescription>
              {error}. Try searching for Apple, S&P 500 or bitcoin.
            </AlertDescription>
          </Alert>
        )}

        {showSkeleton && <ResultsSkeleton />}

        {data && (
          <section
            aria-busy={loading}
            className={`flex flex-col gap-3 transition-opacity duration-200 ${
              loading ? "pointer-events-none opacity-50" : "opacity-100"
            }`}
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex flex-col gap-1.5">
                <h2 className="font-heading text-lg leading-tight font-medium">
                  {data.name}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="font-mono">
                    {data.ticker}
                  </Badge>
                  <Badge variant="outline">{data.range}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {data.points.toLocaleString()} closes · {data.currency}
                  </span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                as of {fmtDate(data.currentDate)}
              </span>
            </div>

            <StatsCards stats={data} />

            <Card className="gap-0">
              <CardHeader className="border-b pb-3">
                <CardTitle>Price history</CardTitle>
                <CardDescription className="text-xs">
                  Adjusted closes — the dashed line marks the peak.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-3">
                <DrawdownChart
                  series={data.series}
                  peakDate={data.peakDate}
                  peakPrice={data.peakPrice}
                  lastSeenDate={data.lastSeenDate}
                  currentDate={data.currentDate}
                  currency={data.currency}
                />
              </CardContent>
            </Card>

            <p className="flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Peak = highest close in the selected range (adjusted for splits
                and dividends). The time-machine date is the most recent day{" "}
                <em>before the peak</em> when price was at or below today&apos;s
                price. Data: Yahoo Finance via yahoo-finance2. Not financial
                advice.
              </span>
            </p>
          </section>
        )}
      </main>

      <footer className="relative border-t border-border/60">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-4 text-[11px] text-muted-foreground sm:px-6">
          <span>
            Every figure is derived from adjusted daily closes — no estimates,
            no smoothing.
          </span>
          <span className="tabular-nums">Data: Yahoo Finance</span>
        </div>
      </footer>
    </div>
  );
}
