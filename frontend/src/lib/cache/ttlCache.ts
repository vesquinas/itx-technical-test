import type { Parser } from '../parse.ts';
import { isRecord } from '../parse.ts';
import type { KeyValueStorage } from './storage.ts';
import { resolveStorage } from './storage.ts';

/** The expiry the brief requires. */
export const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * What actually gets written to the store. The names are short because this is serialised once
 * per product and `localStorage` has a small quota (about 5 MB per origin).
 */
interface Envelope {
  /** Version of the data format. */
  v: number;
  /** Instant, in epoch ms, from which the entry stops being valid. */
  e: number;
  /** Payload, unvalidated. */
  d: unknown;
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    isRecord(value) &&
    typeof value['v'] === 'number' &&
    typeof value['e'] === 'number' &&
    'd' in value
  );
}

export interface TtlCacheOptions {
  /** Key prefix, so we do not step on other data of the same origin. */
  namespace: string;
  /** Time to live of each entry. One hour by default. */
  ttlMs?: number;
  /**
   * Version of the format. Bumping it invalidates everything cached at once, which is what you
   * have to do when the shape of the data changes: without it, a user who already had the previous
   * version in their browser would keep reading it.
   */
  version?: number;
  storage?: KeyValueStorage;
  /** Injectable clock, so expiry can be tested without waiting an hour. */
  now?: () => number;
}

/**
 * Client-side cache with per-entry expiry.
 *
 * - **Validation happens on read, not only on write**, so `get` demands a parser: what comes out of
 *   `localStorage` is text the user may have edited, or that an older version of the application
 *   wrote. Trusting it is what turns a cache into a security hole.
 * - **On expiry the entry is deleted and `undefined` returned**, so the caller revalidates against
 *   the API — which is what the brief asks. Serving the stale value while revalidating shows
 *   out-of-date data, and the requirement says the information "deberá revalidarse".
 * - **No storage failure propagates**: the cache is an optimisation, and the application has to
 *   work without it.
 */
export class TtlCache {
  private readonly storage: KeyValueStorage;
  private readonly prefix: string;
  private readonly ttlMs: number;
  private readonly version: number;
  private readonly now: () => number;

  constructor(options: TtlCacheOptions) {
    this.storage = options.storage ?? resolveStorage();
    this.ttlMs = options.ttlMs ?? ONE_HOUR_MS;
    this.version = options.version ?? 1;
    // A closure rather than a bare `Date.now`: storing the direct reference freezes it at the
    // moment the cache is built, and then replacing the clock (in a test, or with a virtual-time
    // library) has no effect any more.
    this.now = options.now ?? (() => Date.now());
    this.prefix = `${options.namespace}/v${String(this.version)}/`;
  }

  private storageKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Returns the cached value, or `undefined` if there is none, it has expired, or it does not pass
   * validation. Invalid entries are deleted on read so no rubbish accumulates in the browser.
   */
  get<T>(key: string, parse: Parser<T>): T | undefined {
    const storageKey = this.storageKey(key);

    let raw: string | null;
    try {
      raw = this.storage.getItem(storageKey);
    } catch {
      return undefined;
    }
    if (raw === null) return undefined;

    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      this.delete(key);
      return undefined;
    }

    if (!isEnvelope(envelope) || envelope.v !== this.version) {
      this.delete(key);
      return undefined;
    }

    if (this.now() >= envelope.e) {
      this.delete(key);
      return undefined;
    }

    const parsed = parse(envelope.d);
    if (parsed === undefined) {
      this.delete(key);
      return undefined;
    }

    return parsed;
  }

  /** Stores a value with the configured expiry, counted from now. */
  set(key: string, data: unknown): void {
    const envelope: Envelope = { v: this.version, e: this.now() + this.ttlMs, d: data };
    const serialized = JSON.stringify(envelope);

    try {
      this.storage.setItem(this.storageKey(key), serialized);
    } catch {
      // The usual cause here is having run out of quota. We free what is ours and try exactly
      // once more; if it fails again, we carry on without caching.
      this.clear();
      try {
        this.storage.setItem(this.storageKey(key), serialized);
      } catch {
        // No cache. The application carries on: it will hit the API on every request.
      }
    }
  }

  delete(key: string): void {
    try {
      this.storage.removeItem(this.storageKey(key));
    } catch {
      // Nothing to do.
    }
  }

  /** Removes only the entries of this namespace and version. */
  clear(): void {
    try {
      for (const key of this.storage.keys()) {
        if (key.startsWith(this.prefix)) this.storage.removeItem(key);
      }
    } catch {
      // Nothing to do.
    }
  }
}
