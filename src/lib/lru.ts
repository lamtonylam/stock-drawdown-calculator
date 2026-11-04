/**
 * A small bounded LRU with a per-entry TTL.
 *
 * Both API routes need exactly this (200 entries, `X-Cache: HIT|MISS`), and it
 * used to be copy-pasted into each of them — two copies of an eviction policy
 * that has to stay identical. Kept dependency-free and injectable-clock so the
 * behaviour can be tested without timers.
 */
export interface Lru<K, V> {
  /** Fresh value, or `undefined` when absent or expired. Refreshes recency. */
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  clear(): void;
  readonly size: number;
}

export function createLru<K, V>(
  max: number,
  ttlMs: number,
  now: () => number = Date.now
): Lru<K, V> {
  const entries = new Map<K, { at: number; value: V }>();

  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now() - hit.at >= ttlMs) {
        // Drop on read: an expired entry must not keep holding a slot until
        // some later write happens to evict it.
        entries.delete(key);
        return undefined;
      }
      // Re-insert to mark it most recently used — Map iterates in insertion
      // order and eviction takes the first key.
      entries.delete(key);
      entries.set(key, hit);
      return hit.value;
    },

    set(key, value) {
      entries.delete(key);
      entries.set(key, { at: now(), value });
      while (entries.size > max) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },

    clear() {
      entries.clear();
    },

    get size() {
      return entries.size;
    },
  };
}
