import { describe, expect, it } from 'vitest';

import { readCartCount, writeCartCount } from './cartStorage.ts';

describe('cart counter persistence', () => {
  it('starts from zero when nothing is stored', () => {
    expect(readCartCount()).toBe(0);
  });

  it('keeps the counter across reads', () => {
    writeCartCount(3);

    expect(readCartCount()).toBe(3);
  });

  it('accepts zero', () => {
    writeCartCount(0);

    expect(readCartCount()).toBe(0);
  });

  describe('values the user may have tampered with', () => {
    // El contenido de localStorage es editable desde la consola del navegador,
    // so we validate on read rather than trusting them.
    it('drops a counter that is not a number', () => {
      localStorage.setItem('itx-cart-count', 'muchos');

      expect(readCartCount()).toBe(0);
    });

    it('drops a negative counter', () => {
      localStorage.setItem('itx-cart-count', '-5');

      expect(readCartCount()).toBe(0);
    });

    it('drops a counter with decimals', () => {
      localStorage.setItem('itx-cart-count', '2.5');

      expect(readCartCount()).toBe(0);
    });

    it('drops an empty string', () => {
      localStorage.setItem('itx-cart-count', '');

      expect(readCartCount()).toBe(0);
    });
  });
});
