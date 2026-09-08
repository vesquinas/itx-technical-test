import { describe, expect, it, vi } from 'vitest';

import { createMemoryStorage, resolveStorage } from './storage.ts';

describe('createMemoryStorage', () => {
  it('se comporta como un almacén clave-valor', () => {
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
  it('usa localStorage cuando está disponible', () => {
    const storage = resolveStorage();

    storage.setItem('clave', 'valor');

    expect(localStorage.getItem('clave')).toBe('valor');
  });

  it('expone las claves de localStorage', () => {
    localStorage.setItem('uno', '1');
    localStorage.setItem('dos', '2');

    expect(resolveStorage().keys().toSorted()).toEqual(['dos', 'uno']);
  });

  it('degrada a memoria cuando localStorage rechaza la escritura', () => {
    // Reproduce la navegación privada de Safari: el objeto existe pero lanza.
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('cuota agotada', 'QuotaExceededError');
    });

    const storage = resolveStorage();

    expect(() => {
      storage.setItem('clave', 'valor');
    }).not.toThrow();
    expect(storage.getItem('clave')).toBe('valor');
  });

  it('no deja la clave de sondeo en el almacén', () => {
    resolveStorage();

    expect(localStorage.length).toBe(0);
  });
});
