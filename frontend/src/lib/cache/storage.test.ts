import { describe, expect, it, vi } from 'vitest';

import { createMemoryStorage, resolveStorage } from './storage.ts';

describe('createMemoryStorage', () => {
  it('behaves like a key-value store', () => {
    const storage = createMemoryStorage();

    expect(storage.getItem('a')).toBeNull();

    storage.setItem('a', '1');
    expect(storage.getItem('a')).toBe('1');

    storage.setItem('b', '2');
    expect(storage.keys()).toEqual(['a', 'b']);

    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
    expect(storage.keys()).toEqual(['b']);
  });
});

describe('resolveStorage', () => {
  it('uses localStorage when it is available', () => {
    const storage = resolveStorage();

    storage.setItem('clave', 'valor');

    expect(localStorage.getItem('clave')).toBe('valor');
  });

  it('exposes the keys of localStorage', () => {
    localStorage.setItem('uno', '1');
    localStorage.setItem('dos', '2');

    expect(resolveStorage().keys().toSorted()).toEqual(['dos', 'uno']);
  });

  it('degrades to memory when localStorage rejects the write', () => {
    // Reproduces Safari private browsing: the object exists but throws.
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('cuota agotada', 'QuotaExceededError');
    });

    const storage = resolveStorage();

    expect(() => {
      storage.setItem('clave', 'valor');
    }).not.toThrow();
    expect(storage.getItem('clave')).toBe('valor');
  });

  it('does not leave the probe key behind in the store', () => {
    resolveStorage();

    expect(localStorage.length).toBe(0);
  });
});
