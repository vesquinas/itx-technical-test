/**
 * The minimal storage surface the cache needs.
 *
 * Defining it as an interface instead of using `localStorage` directly buys two things: testing
 * the cache without a browser, and degrading to memory when persistent storage is unavailable.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** The keys present, needed to be able to clear by prefix. */
  keys(): string[];
}

export function createMemoryStorage(): KeyValueStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    keys: () => [...entries.keys()],
  };
}

function wrapWebStorage(storage: Storage): KeyValueStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      storage.setItem(key, value);
    },
    removeItem: (key) => {
      storage.removeItem(key);
    },
    keys: () => {
      const result: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key !== null) result.push(key);
      }
      return result;
    },
  };
}

const PROBE_KEY = '__itx_storage_probe__';

/**
 * Checks that the storage can really be read from and written to.
 *
 * `localStorage` existing is not enough: in Safari private browsing and with third-party cookies
 * blocked, the object is there but `setItem` throws. Even accessing the property itself can throw
 * inside a restricted iframe, which is why the access sits in a `try`.
 */
export function isUsable(storage: KeyValueStorage): boolean {
  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns `localStorage` if it is usable, and an in-memory store otherwise.
 *
 * The cache is an optimisation: when persisting is impossible the application still has to work,
 * even if it loses the caching across reloads.
 */
export function resolveStorage(): KeyValueStorage {
  try {
    const candidate = wrapWebStorage(globalThis.localStorage);
    if (isUsable(candidate)) return candidate;
  } catch {
    // No access to localStorage: fall back to memory.
  }
  return createMemoryStorage();
}
