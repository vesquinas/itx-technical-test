import type { KeyValueStorage } from '../lib/cache/index.ts';
import { resolveStorage } from '../lib/cache/index.ts';
import { asNonNegativeInteger } from '../lib/parse.ts';

const STORAGE_KEY = 'itx-cart-count';

/**
 * The store is resolved once and remembered.
 *
 * `resolveStorage` checks that writing really works, and to do that it writes and removes a probe
 * key. Calling it on every read and every write of the counter turned two operations into six, and
 * left a probe write behind every time the header rendered. It is resolved lazily, on first use, so
 * importing the module does not touch storage.
 */
let resolved: KeyValueStorage | undefined;

function storage(): KeyValueStorage {
  resolved ??= resolveStorage();
  return resolved;
}

/**
 * Persistence of the cart counter.
 *
 * The brief asks for the number of items to be shown in the header on every view and for the value
 * to be persisted. It is stored separately from the product cache because it does not expire: it is
 * not cached API information, it is the state of the user's session.
 *
 * It is validated on read for the same reason as in the cache: the contents of `localStorage` are
 * editable by the user, and `"abc"` or `-5` are not valid counters.
 */
export function readCartCount(): number {
  const raw = storage().getItem(STORAGE_KEY);
  if (raw === null) return 0;

  const parsed = Number(raw);
  return asNonNegativeInteger(parsed) ?? 0;
}

export function writeCartCount(count: number): void {
  storage().setItem(STORAGE_KEY, String(count));
}
