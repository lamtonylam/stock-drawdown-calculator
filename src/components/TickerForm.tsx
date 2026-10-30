"use client";

import { ArrowRightIcon, LoaderIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RANGES, type RangeKey } from "@/lib/ranges";

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = RANGES.map(
  (value) => ({ value, label: value === "MAX" ? "Max" : value })
);

const PRESETS = ["^GSPC", "^NDX", "^DJI", "AAPL", "NVDA", "BTC-USD"];

export function TickerForm({
  ticker,
  range,
  draft,
  onDraftChange,
  loading,
  onSubmit,
}: {
  ticker: string;
  range: RangeKey;
  draft: string;
  onDraftChange: (value: string) => void;
  loading: boolean;
  onSubmit: (ticker: string, range: RangeKey) => void;
}) {
  const submit = (r: RangeKey = range) => {
    onSubmit(draft.trim() || "^GSPC", r);
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(e) => onDraftChange(e.target.value.toUpperCase())}
            placeholder="^GSPC"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={12}
            aria-label="Ticker symbol"
            className="h-10 pl-9 font-mono text-sm tracking-wide uppercase placeholder:normal-case"
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="h-10 px-4 font-medium shadow-sm"
        >
          {loading ? (
            <LoaderIcon className="animate-spin" data-icon="inline-start" />
          ) : (
            <ArrowRightIcon data-icon="inline-end" />
          )}
          {loading ? "Loading" : "Calculate"}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={range}
          aria-label="Date range"
          onValueChange={(v) => {
            if (v) submit(v as RangeKey);
          }}
        >
          {RANGE_OPTIONS.map((r) => (
            <ToggleGroupItem
              key={r.value}
              value={r.value}
              className="min-w-11 px-2.5 text-xs font-medium"
            >
              {r.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Separator
          orientation="vertical"
          className="hidden h-5 sm:block"
        />

        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <Button
              key={p}
              type="button"
              variant="ghost"
              size="xs"
              aria-pressed={ticker === p}
              onClick={() => {
                onSubmit(p, range);
              }}
              className="font-mono text-[11px] text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              {p}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
