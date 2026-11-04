import { describe, expect, it } from "vitest";
import { createLru } from "./lru";

/** Controllable clock — no fake timers, no sleeps. */
function clock() {
  let t = 1_000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createLru", () => {
  it("returns stored values and misses unknown keys", () => {
    const c = clock();
    const lru = createLru<string, number>(2, 100, c.now);
    lru.set("a", 1);
    expect(lru.get("a")).toBe(1);
    expect(lru.get("nope")).toBeUndefined();
    expect(lru.size).toBe(1);
  });

  it("expires entries after the TTL and frees their slot", () => {
    const c = clock();
    const lru = createLru<string, number>(2, 100, c.now);
    lru.set("a", 1);
    c.advance(99);
    expect(lru.get("a")).toBe(1);
    c.advance(1);
    expect(lru.get("a")).toBeUndefined();
    // Expired entries must not pin a slot until some later write evicts them.
    expect(lru.size).toBe(0);
  });

  it("evicts the least recently used entry past the cap", () => {
    const c = clock();
    const lru = createLru<string, number>(2, 10_000, c.now);
    lru.set("a", 1);
    lru.set("b", 2);
    c.advance(1);
    // A read counts as use, so "a" is now newer than "b".
    expect(lru.get("a")).toBe(1);
    c.advance(1);
    lru.set("c", 3);

    expect(lru.size).toBe(2);
    expect(lru.get("b")).toBeUndefined();
    expect(lru.get("a")).toBe(1);
    expect(lru.get("c")).toBe(3);
  });

  it("overwrites a key without growing past the cap", () => {
    const c = clock();
    const lru = createLru<string, number>(2, 10_000, c.now);
    lru.set("a", 1);
    lru.set("a", 2);
    expect(lru.size).toBe(1);
    expect(lru.get("a")).toBe(2);
  });

  it("clear() empties the cache", () => {
    const c = clock();
    const lru = createLru<string, number>(2, 10_000, c.now);
    lru.set("a", 1);
    lru.clear();
    expect(lru.size).toBe(0);
    expect(lru.get("a")).toBeUndefined();
  });
});
