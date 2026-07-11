/**
 * In-memory session cache for deduplicating identical reads while navigating the UI.
 * Not a stale-while-revalidate layer — entries expire by TTL and can be invalidated
 * explicitly after writes.
 */

const entries = new Map();
const inFlight = new Map();

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetcher
 * @param {{ ttlMs?: number, forceRefresh?: boolean }} [options]
 * @returns {Promise<T>}
 */
export async function getSessionCachedQuery(key, fetcher, { ttlMs = 45_000, forceRefresh = false } = {}) {
  const cacheKey = String(key ?? "").trim();
  if (!cacheKey) {
    return fetcher();
  }

  if (!forceRefresh) {
    const hit = entries.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
  } else {
    entries.delete(cacheKey);
  }

  const pending = inFlight.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      entries.set(cacheKey, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, request);
  return request;
}

export function invalidateSessionCache(key) {
  const cacheKey = String(key ?? "").trim();
  if (!cacheKey) return;
  entries.delete(cacheKey);
  inFlight.delete(cacheKey);
}

export function invalidateSessionCacheByPrefix(prefix) {
  const needle = String(prefix ?? "");
  if (!needle) return;
  for (const key of [...entries.keys()]) {
    if (key.startsWith(needle)) entries.delete(key);
  }
  for (const key of [...inFlight.keys()]) {
    if (key.startsWith(needle)) inFlight.delete(key);
  }
}

export function clearSessionQueryCache() {
  entries.clear();
  inFlight.clear();
}
