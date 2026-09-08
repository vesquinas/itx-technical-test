import { describe, expect, it } from 'vitest';

import { readCartCount, writeCartCount } from './cartStorage.ts';

describe('persistencia del contador de la cesta', () => {
  it('parte de cero cuando no hay nada guardado', () => {
    expect(readCartCount()).toBe(0);
  });

  it('conserva el contador entre lecturas', () => {
    writeCartCount(3);

    expect(readCartCount()).toBe(3);
  });

  it('acepta el cero', () => {
    writeCartCount(0);

    expect(readCartCount()).toBe(0);
  });

  describe('valores que el usuario puede haber manipulado', () => {
    // El contenido de localStorage es editable desde la consola del navegador,
    // así que se valida al leer en lugar de confiar en el.
    it('descarta un contador que no es un número', () => {
      localStorage.setItem('itx-cart-count', 'muchos');

      expect(readCartCount()).toBe(0);
    });

    it('descarta un contador negativo', () => {
      localStorage.setItem('itx-cart-count', '-5');

      expect(readCartCount()).toBe(0);
    });

    it('descarta un contador con decimales', () => {
      localStorage.setItem('itx-cart-count', '2.5');

      expect(readCartCount()).toBe(0);
    });

    it('descarta una cadena vacía', () => {
      localStorage.setItem('itx-cart-count', '');

      expect(readCartCount()).toBe(0);
    });
  });
});
