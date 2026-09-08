import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Parser } from '../parse.ts';
import { isRecord } from '../parse.ts';
import type { KeyValueStorage } from './storage.ts';
import { createMemoryStorage } from './storage.ts';
import { ONE_HOUR_MS, TtlCache } from './ttlCache.ts';

/** A toy parser: it accepts `{ name: string }` and rejects anything else. */
const parseNamed: Parser<{ name: string }> = (input) => {
  if (!isRecord(input) || typeof input['name'] !== 'string') return undefined;
  return { name: input['name'] };
};

describe('TtlCache', () => {
  let storage: KeyValueStorage;
  let clock: number;
  const now = () => clock;

  const createCache = (options: { ttlMs?: number; version?: number } = {}) =>
    new TtlCache({ namespace: 'test', storage, now, ...options });

  beforeEach(() => {
    storage = createMemoryStorage();
    clock = 1_700_000_000_000;
  });

  it('returns undefined when the key does not exist', () => {
    expect(createCache().get('ausente', parseNamed)).toBeUndefined();
  });

  it('stores and retrieves a value within its time to live', () => {
    const cache = createCache();
    cache.set('producto', { name: 'Iconia' });

    expect(cache.get('producto', parseNamed)).toEqual({ name: 'Iconia' });
  });

  describe('expiry', () => {
    it('still serves the value just before the hour', () => {
      const cache = createCache();
      cache.set('producto', { name: 'Iconia' });

      clock += ONE_HOUR_MS - 1;

      expect(cache.get('producto', parseNamed)).toEqual({ name: 'Iconia' });
    });

    it('expires exactly on the hour', () => {
      const cache = createCache();
      cache.set('producto', { name: 'Iconia' });

      clock += ONE_HOUR_MS;

      expect(cache.get('producto', parseNamed)).toBeUndefined();
    });

    it('uses one hour as the default time to live', () => {
      const cache = new TtlCache({ namespace: 'test', storage, now });
      cache.set('producto', { name: 'Iconia' });

      clock += ONE_HOUR_MS - 1;
      expect(cache.get('producto', parseNamed)).toEqual({ name: 'Iconia' });

      clock += 1;
      expect(cache.get('producto', parseNamed)).toBeUndefined();
    });

    it('honours a custom time to live', () => {
      const cache = createCache({ ttlMs: 5_000 });
      cache.set('producto', { name: 'Iconia' });

      clock += 5_000;

      expect(cache.get('producto', parseNamed)).toBeUndefined();
    });

    it('removes the expired entry from the store, so no rubbish accumulates', () => {
      const cache = createCache();
      cache.set('producto', { name: 'Iconia' });
      clock += ONE_HOUR_MS;

      cache.get('producto', parseNamed);

      expect(storage.keys()).toEqual([]);
    });

    it('caches again with a fresh expiry after revalidating', () => {
      const cache = createCache();
      cache.set('producto', { name: 'Iconia' });
      clock += ONE_HOUR_MS;
      expect(cache.get('producto', parseNamed)).toBeUndefined();

      cache.set('producto', { name: 'Iconia' });
      clock += ONE_HOUR_MS - 1;

      expect(cache.get('producto', parseNamed)).toEqual({ name: 'Iconia' });
    });
  });

  describe('untrusted data', () => {
    it('drops an entry that is not valid JSON', () => {
      const cache = createCache();
      storage.setItem('test/v1/producto', 'esto no es json');

      expect(cache.get('producto', parseNamed)).toBeUndefined();
      expect(storage.keys()).toEqual([]);
    });

    it('drops an entry whose payload does not pass validation', () => {
      const cache = createCache();
      cache.set('producto', { nombre: 'campo equivocado' });

      expect(cache.get('producto', parseNamed)).toBeUndefined();
      expect(storage.keys()).toEqual([]);
    });

    it('drops an entry without the expected envelope structure', () => {
      const cache = createCache();
      storage.setItem('test/v1/producto', JSON.stringify({ name: 'sin sobre' }));

      expect(cache.get('producto', parseNamed)).toBeUndefined();
    });

    it('ignores what an earlier version of the format wrote', () => {
      createCache({ version: 1 }).set('producto', { name: 'Iconia' });

      expect(createCache({ version: 2 }).get('producto', parseNamed)).toBeUndefined();
    });
  });

  describe('isolation and clean-up', () => {
    it('does not read the keys of another namespace', () => {
      new TtlCache({ namespace: 'otro', storage, now }).set('producto', { name: 'Iconia' });

      expect(createCache().get('producto', parseNamed)).toBeUndefined();
    });

    it('clear() only removes its own keys', () => {
      createCache().set('producto', { name: 'Iconia' });
      storage.setItem('ajeno', 'no tocar');

      createCache().clear();

      expect(storage.keys()).toEqual(['ajeno']);
    });

    it('delete() removes a single entry', () => {
      const cache = createCache();
      cache.set('a', { name: 'A' });
      cache.set('b', { name: 'B' });

      cache.delete('a');

      expect(cache.get('a', parseNamed)).toBeUndefined();
      expect(cache.get('b', parseNamed)).toEqual({ name: 'B' });
    });
  });

  describe('store resilience', () => {
    it('does not propagate the error when the quota runs out, and retries after freeing', () => {
      const failing = createMemoryStorage();
      let rejectWrites = true;
      const setItem = vi.spyOn(failing, 'setItem').mockImplementation((key, value) => {
        if (rejectWrites) {
          rejectWrites = false;
          throw new DOMException('cuota agotada', 'QuotaExceededError');
        }
        createMemoryStorage().setItem(key, value);
      });

      const cache = new TtlCache({ namespace: 'test', storage: failing, now });

      expect(() => {
        cache.set('producto', { name: 'Iconia' });
      }).not.toThrow();
      expect(setItem).toHaveBeenCalledTimes(2);
    });

    it('does not propagate the error when the read fails', () => {
      const failing = createMemoryStorage();
      vi.spyOn(failing, 'getItem').mockImplementation(() => {
        throw new DOMException('sin acceso', 'SecurityError');
      });

      const cache = new TtlCache({ namespace: 'test', storage: failing, now });

      expect(cache.get('producto', parseNamed)).toBeUndefined();
    });
  });
});
