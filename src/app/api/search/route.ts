import { NextResponse } from "next/server";
import { createLru } from "@/lib/lru";
import { searchSymbols, type SymbolResult } from "@/lib/yahoo";

const UPSTREAM_TIMEOUT_MS = 8_000;

/**
 * Suggestions must stay fresh: Yahoo's ranking is flaky and a thin response
 * (e.g. only the ADR, missing the home listing) must never stick around.
 * Short server TTL, short edge TTL — and the client fetches with
 * `cache: "no-store"` to bypass the browser cache entirely.
 */
const CACHE_CONTROL = "public, s-maxage=120, stale-while-revalidate=600";

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

/** Letters, numbers, spaces and the punctuation real names use (&, ., -, /). */
const QUERY_RE = /^[A-Z0-9 .&'\-/^=]{1,60}$/i;

/** Shared bounded LRU; exported so tests can reset it between cases. */
export const searchCache = createLru<string, SymbolResult[]>(
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS
);

export async function GET(req: Request) {
  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(req.url).searchParams;
  } catch {
    return NextResponse.json({ error: "Invalid request URL" }, { status: 400 });
  }

  const raw = (searchParams.get("q") ?? "").trim();
  if (!raw || !QUERY_RE.test(raw)) {
    return NextResponse.json(
      { error: "Invalid search query" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  const q = raw.toUpperCase();

  const hit = searchCache.get(q);
  if (hit) {
    return NextResponse.json(
      { results: hit },
      { headers: { "X-Cache": "HIT", "Cache-Control": CACHE_CONTROL } }
    );
  }

  try {
    const results = await searchSymbols(
      raw,
      AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    );
    searchCache.set(q, results);
    return NextResponse.json(
      { results },
      { headers: { "X-Cache": "MISS", "Cache-Control": CACHE_CONTROL } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    const status = /abort|timeout|timed out/i.test(msg) ? 504 : 502;
    return NextResponse.json(
      { error: status === 504 ? "Search took too long" : msg },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
