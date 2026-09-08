import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Parser } from '../parse.ts';
import { isRecord } from '../parse.ts';
import type { KeyValueStorage } from './storage.ts';
import { createMemoryStorage } from './storage.ts';
import { ONE_HOUR_MS, TtlCache } from './ttlCache.ts';

/** Parser de juguete: acepta `{ name: string }` y rechaza cualquier otra cosa. */
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

  it('devuelve undefined cuando la clave no existe', () => {
    expect(createCache().get('ausente', parseNamed)).toBeUndefined();
  });

  it('guarda y recupera un valor dentro de su tiempo de vida', () => {
    const cache = createCache();
    cache.set('producto', { name: 'Iconia' });

    expect(cache.get('producto', parseNamed)).toEqual({ name: 'Iconia' });
  });

  describe('expiracion', () => {
    it('sigue sirviendo el valor justo antes de la hora', () => {
      const cache = createCache();
      cache.set('producto', { name: 'Iconia' });

      clock += ONE_HOUR_MS - 1;

      expect(cache.get('producto', parseNamed)).toEqual({ name: 'Iconia' });
    });

    it('caduca exactamente al cumplirse la hora', () => {
      const cache = createCache();
      cache.set('producto', { name: 'Iconia' });

      clock += ONE_HOUR_MS;

      expect(cache.get('producto', parseNamed)).toBeUndefined();
    });

    it('usa una hora como tiempo de vida por defecto', () => {
      const cache = new TtlCache({ namespace: 'test', storage, now });
      cache.set('producto', { name: 'Iconia' });

      clock += ONE_HOUR_MS - 1;
      expect(cache.get('producto', parseNamed)).toEqual({ name: 'Iconia' });

      clock += 1;
      expect(cache.get('producto', parseNamed)).toBeUndefined();
    });

    it('respeta un tiempo de vida personalizado', () => {
      const cache = createCache({ ttlMs: 5_000 });
      cache.set('producto', { name: 'Iconia' });

      clock += 5_000;

      expect(cache.get('producto', parseNamed)).toBeUndefined();
    });

    it('elimina del almacen la entrada caducada, para no acumular basura', () => {
      const cache = createCache();
      cache.set('producto', { name: 'Iconia' });
      clock += ONE_HOUR_MS;

      cache.get('producto', parseNamed);

      expect(storage.keys()).toEqual([]);
    });

    it('vuelve a cachear con una expiracion nueva tras revalidar', () => {
      const cache = createCache();
      cache.set('producto', { name: 'Iconia' });
      clock += ONE_HOUR_MS;
      expect(cache.get('producto', parseNamed)).toBeUndefined();

      cache.set('producto', { name: 'Iconia' });
      clock += ONE_HOUR_MS - 1;

      expect(cache.get('producto', parseNamed)).toEqual({ name: 'Iconia' });
    });
  });

  describe('datos que no son de fiar', () => {
    it('descarta una entrada que no es JSON valido', () => {
      const cache = createCache();
      storage.setItem('test/v1/producto', 'esto no es json');

      expect(cache.get('producto', parseNamed)).toBeUndefined();
      expect(storage.keys()).toEqual([]);
    });

    it('descarta una entrada cuya carga util no supera la validacion', () => {
      const cache = createCache();
      cache.set('producto', { nombre: 'campo equivocado' });

      expect(cache.get('producto', parseNamed)).toBeUndefined();
      expect(storage.keys()).toEqual([]);
    });

    it('descarta una entrada sin la estructura de sobre esperada', () => {
      const cache = createCache();
      storage.setItem('test/v1/producto', JSON.stringify({ name: 'sin sobre' }));

      expect(cache.get('producto', parseNamed)).toBeUndefined();
    });

    it('ignora lo escrito por una version anterior del formato', () => {
      createCache({ version: 1 }).set('producto', { name: 'Iconia' });

      expect(createCache({ version: 2 }).get('producto', parseNamed)).toBeUndefined();
    });
  });

  describe('aislamiento y limpieza', () => {
    it('no lee las claves de otro namespace', () => {
      new TtlCache({ namespace: 'otro', storage, now }).set('producto', { name: 'Iconia' });

      expect(createCache().get('producto', parseNamed)).toBeUndefined();
    });

    it('clear() solo borra las claves propias', () => {
      createCache().set('producto', { name: 'Iconia' });
      storage.setItem('ajeno', 'no tocar');

      createCache().clear();

      expect(storage.keys()).toEqual(['ajeno']);
    });

    it('delete() elimina una sola entrada', () => {
      const cache = createCache();
      cache.set('a', { name: 'A' });
      cache.set('b', { name: 'B' });

      cache.delete('a');

      expect(cache.get('a', parseNamed)).toBeUndefined();
      expect(cache.get('b', parseNamed)).toEqual({ name: 'B' });
    });
  });

  describe('resiliencia del almacen', () => {
    it('no propaga el error cuando se agota la cuota, y reintenta tras liberar', () => {
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

    it('no propaga el error cuando la lectura falla', () => {
      const failing = createMemoryStorage();
      vi.spyOn(failing, 'getItem').mockImplementation(() => {
        throw new DOMException('sin acceso', 'SecurityError');
      });

      const cache = new TtlCache({ namespace: 'test', storage: failing, now });

      expect(cache.get('producto', parseNamed)).toBeUndefined();
    });
  });
});
