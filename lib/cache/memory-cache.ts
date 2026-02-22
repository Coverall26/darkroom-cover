/**
 * Simple in-memory TTL cache for serverless hot paths.
 * Each cache entry expires after `ttlMs` milliseconds.
 *
 * NOTE: In serverless environments (Vercel), this cache is per-instance.
 * For cross-instance caching, use Redis (Upstash) instead.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Get or compute a cached value.
 * @param key - Cache key
 * @param fn - Async function to compute the value if not cached
 * @param ttlMs - Time-to-live in milliseconds (default: 30000 = 30s)
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = 30_000,
): Promise<T> {
  const now = Date.now();
  const existing = store.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/**
 * Invalidate a specific cache key.
 */
export function invalidateCache(key: string): void {
  store.delete(key);
}

/**
 * Invalidate all cache keys matching a prefix.
 */
export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * Clear all cached entries.
 */
export function clearCache(): void {
  store.clear();
}
