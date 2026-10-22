/**
 * Deep module Cache — single factory for all TTL caches.
 * Persists via globalThis so HMR / serverless reuse survives.
 * Eviction: expired-first, then oldest (insertion order).
 */

export interface TtlCache<T = unknown> {
  get(key: string): T | null;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
  /** Delete all keys with given prefix (for session-scoped invalidation). */
  deleteByPrefix(prefix: string): void;
  size(): number;
  /** For tests: wipe entirely. */
  _raw(): Map<string, { data: T; expiry: number }>;
}

interface Entry<T> {
  data: T;
  expiry: number;
}

type GlobalCacheMap = Map<string, Entry<unknown>>;

export function createTtlCache<T = unknown>(opts: {
  ttl: number;
  staleTtl?: number;
  max: number;
  globalKey: string;
}): TtlCache<T> {
  const g = globalThis as unknown as Record<string, GlobalCacheMap | undefined>;
  const store: Map<string, Entry<T>> =
    (g[opts.globalKey] as Map<string, Entry<T>> | undefined) ??
    ((g[opts.globalKey] as unknown as Map<string, Entry<T>>) = new Map());

  const stale = opts.staleTtl ?? 0;

  function get(key: string): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    const now = Date.now();
    if (now <= entry.expiry) return entry.data;
    if (stale > 0 && now <= entry.expiry + stale) return entry.data;
    store.delete(key);
    return null;
  }

  function set(key: string, data: T): void {
    store.set(key, { data, expiry: Date.now() + opts.ttl });
    if (store.size <= opts.max) return;
    const now = Date.now();
    // Phase 1: evict expired (including stale-expired if stale enabled)
    for (const [k, entry] of store) {
      if (store.size <= opts.max) break;
      const expired =
        stale > 0 ? now > entry.expiry + stale : now > entry.expiry;
      if (expired) store.delete(k);
    }
    // Phase 2: evict oldest remaining
    for (const [k] of store) {
      if (store.size <= opts.max) break;
      store.delete(k);
    }
  }

  return {
    get,
    set,
    delete: (k) => store.delete(k),
    clear: () => store.clear(),
    deleteByPrefix: (prefix: string) => {
      for (const k of [...store.keys()]) {
        if (k.startsWith(prefix)) store.delete(k);
      }
    },
    size: () => store.size,
    _raw: () => store,
  };
}

// ── Pre-configured shared caches (import these, don't create new ones) ──
export const rssCache = createTtlCache<unknown>({
  ttl: 30_000,
  staleTtl: 30_000,
  max: 50,
  globalKey: "__rssCache",
});

export const whitelistCache = createTtlCache<unknown>({
  ttl: 30_000,
  staleTtl: 10_000,
  max: 30,
  globalKey: "__whitelistCache",
});

export const statsCache = createTtlCache<unknown>({
  ttl: 30_000,
  staleTtl: 30_000,
  max: 20,
  globalKey: "__statsCache",
});

export const dashboardCache = createTtlCache<unknown>({
  ttl: 60_000,
  staleTtl: 60_000,
  max: 20,
  globalKey: "__dashboardCache",
});

/**
 * Clear all session-scoped caches for a given hashed session.
 * Single seam for whitelist mutate invalidation — no more globalThis casts.
 */
export function clearCachesForSession(hashedSession: string): void {
  whitelistCache.deleteByPrefix(`whitelist:${hashedSession}:`);
  rssCache.deleteByPrefix(`rss:${hashedSession}:`);
  dashboardCache.delete(hashedSession);
  statsCache.delete(`stats:${hashedSession}`);
}
