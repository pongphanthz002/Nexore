/**
 * Small helpers for resilient, read-efficient Firestore access.
 */

const TRANSIENT_CODES = new Set(['unavailable', 'deadline-exceeded', 'resource-exhausted', 'aborted']);

function errorCode(err: unknown): string {
  return (err as { code?: string })?.code?.replace(/^firestore\//, '') || '';
}

/**
 * True when the error looks like a connectivity problem rather than a data/permission problem.
 */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = errorCode(err);
  if (TRANSIENT_CODES.has(code)) return true;
  const message = (err as Error)?.message || '';
  return /network|offline|failed to fetch|client is offline/i.test(message);
}

/**
 * Retry an async operation on transient Firestore/network errors with backoff.
 */
export async function withRetry<T>(fn: () => Promise<T>, { retries = 2, baseDelayMs = 300 } = {}): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isNetworkError(err)) throw err;
      const delay = baseDelayMs * Math.pow(3, attempt); // 300ms, 900ms
      attempt++;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Collapse concurrent identical requests into one: callers with the same key
 * share the in-flight promise instead of issuing duplicate reads.
 */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

let nextCacheId = 0;

/**
 * Simple in-memory TTL cache keyed by string (e.g. `${projectId}:subjects`).
 */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expires: number }>();
  /** Scopes in-flight dedupe keys to this cache, so caches with equal keys never share a load. */
  private readonly id = ++nextCacheId;

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  /** Invalidate one key, every key starting with `prefix`, or everything. */
  invalidate(prefix?: string): void {
    if (prefix === undefined) {
      this.store.clear();
      return;
    }
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /**
   * Return cached value or load it once (concurrent callers share the load).
   */
  async getOrLoad(key: string, loader: () => Promise<T>, forceRefresh = false): Promise<T> {
    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached !== undefined) return cached;
    }
    return dedupe(`ttl:${this.id}:${key}`, async () => {
      const value = await loader();
      this.set(key, value);
      return value;
    });
  }
}

/**
 * Client-side cooldown for manual refresh buttons. Returns true if allowed now.
 */
const lastRun = new Map<string, number>();
export function allowAction(key: string, cooldownMs = 10_000): boolean {
  const now = Date.now();
  const prev = lastRun.get(key) || 0;
  if (now - prev < cooldownMs) return false;
  lastRun.set(key, now);
  return true;
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
