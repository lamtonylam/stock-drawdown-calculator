"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRightIcon,
  LoaderIcon,
  SearchIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { friendlyName } from "@/lib/names";
import { RANGES, type RangeKey } from "@/lib/ranges";

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = RANGES.map(
  (value) => ({ value, label: value === "MAX" ? "Max" : value })
);

const PRESETS = ["^GSPC", "^NDX", "^DJI", "AAPL", "NVDA", "BTC-USD"].map(
  (symbol) => ({ symbol, label: friendlyName(symbol) })
);

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

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
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);
  // True only when the last draft change came from typing in the box.
  // Tells real typing apart from parent-driven updates (initial value,
  // preset clicks, submitted symbols), which must dismiss — never open —
  // the dropdown.
  const typedRef = useRef(false);

  // Debounced natural-language lookup — "apple" → AAPL, "s&p" → ^GSPC.
  // State writes happen inside the timer callback (never synchronously in
  // the effect body) to avoid cascading renders.
  useEffect(() => {
    const q = draft.trim();
    const timer = setTimeout(async () => {
      if (!typedRef.current) {
        // Parent-driven change (or initial mount) — dismiss and invalidate
        // any in-flight lookup so a slow response can't reopen the
        // dropdown afterwards.
        searchSeq.current++;
        setResults([]);
        setOpen(false);
        setHighlight(-1);
        setSearching(false);
        return;
      }
      typedRef.current = false;
      if (q.length < MIN_QUERY_LENGTH) {
        setResults([]);
        setOpen(false);
        setHighlight(-1);
        setSearching(false);
        return;
      }
      setSearching(true);
      const seq = ++searchSeq.current;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        // A slower keystroke must not overwrite newer results.
        if (searchSeq.current !== seq) return;
        const list: SymbolResult[] = Array.isArray(json.results)
          ? json.results
          : [];
        setResults(list);
        setOpen(list.length > 0);
        setHighlight(list.length > 0 ? 0 : -1);
      } catch {
        if (searchSeq.current === seq) {
          setResults([]);
          setOpen(false);
        }
      } finally {
        if (searchSeq.current === seq) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const dismiss = () => {
    // Invalidate any in-flight lookup so it can't reopen the dropdown, and
    // clear results so refocusing the input doesn't resurrect a stale list.
    searchSeq.current++;
    setResults([]);
    setOpen(false);
    setHighlight(-1);
  };

  const submit = (r: RangeKey = range) => {
    // Prefer the top suggestion — typing "apple" + Enter resolves to AAPL
    // instead of sending the raw text as a (bogus) ticker. Uses `results`
    // rather than `open` so Escape-to-hide followed by Enter still resolves.
    const pick =
      results.length > 0
        ? results[Math.max(highlight, 0)].symbol
        : draft.trim().toUpperCase() || "^GSPC";
    dismiss();
    onSubmit(pick, r);
  };

  const choose = (s: SymbolResult) => {
    dismiss();
    onSubmit(s.symbol, range);
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
        <div ref={boxRef} className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(e) => {
              typedRef.current = true;
              onDraftChange(e.target.value);
            }}
            onFocus={() => {
              if (results.length > 0) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (!open || results.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => (h + 1) % results.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => (h - 1 + results.length) % results.length);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Apple, S&P 500, bitcoin…"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            maxLength={60}
            aria-label="Search by company name or ticker symbol"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={
              open && highlight >= 0 ? `${listId}-${highlight}` : undefined
            }
            role="combobox"
            aria-autocomplete="list"
            className="h-10 pr-9 pl-9 text-sm"
          />
          {searching && (
            <LoaderIcon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}

          {open && results.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Matching symbols"
              className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
            >
              {results.map((s, i) => (
                <li
                  key={s.symbol}
                  role="option"
                  aria-selected={i === highlight}
                  id={`${listId}-${i}`}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(s)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      i === highlight ? "bg-muted" : "bg-transparent"
                    }`}
                  >
                    <TrendingUpIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {s.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {[s.exchange, s.type].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                      {s.symbol}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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

        <Separator orientation="vertical" className="hidden h-5 sm:block" />

        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <Button
              key={p.symbol}
              type="button"
              variant="ghost"
              size="xs"
              title={p.symbol}
              aria-pressed={ticker === p.symbol}
              onClick={() => {
                onSubmit(p.symbol, range);
              }}
              className="text-[11px] text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
