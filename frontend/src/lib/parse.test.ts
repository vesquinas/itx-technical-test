import { describe, expect, it } from 'vitest';

import {
  asArrayOf,
  asHttpUrl,
  asPositiveInteger,
  asPrice,
  asText,
  asTextList,
  isRecord,
} from './parse.ts';

describe('isRecord', () => {
  it('acepta objetos planos y rechaza el resto', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
    expect(isRecord('texto')).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('asText', () => {
  it('recorta y colapsa los blancos', () => {
    expect(asText('  Iconia   Talk  S ')).toBe('Iconia Talk S');
  });

  it('devuelve cadena vacía para lo que no es texto', () => {
    expect(asText(undefined)).toBe('');
    expect(asText(null)).toBe('');
    expect(asText(42)).toBe('');
    expect(asText(['a'])).toBe('');
  });
});

describe('asTextList', () => {
  it('envuelve un texto suelto en una lista', () => {
    expect(asTextList('Quad-core 1.3 GHz')).toEqual(['Quad-core 1.3 GHz']);
  });

  it('conserva las listas de textos', () => {
    expect(asTextList(['13 MP', 'autofocus'])).toEqual(['13 MP', 'autofocus']);
  });

  it('descarta los elementos vacíos o que no son texto', () => {
    expect(asTextList(['13 MP', '', '  ', null, 7, 'autofocus'])).toEqual(['13 MP', 'autofocus']);
  });

  it('devuelve lista vacía cuando no hay valor', () => {
    expect(asTextList(undefined)).toEqual([]);
    expect(asTextList('')).toEqual([]);
    expect(asTextList([])).toEqual([]);
  });
});

describe('asPrice', () => {
  it('convierte el precio en texto que devuelve la API', () => {
    expect(asPrice('170')).toBe(170);
    expect(asPrice('1099.99')).toBe(1099.99);
    expect(asPrice(' 170 ')).toBe(170);
  });

  it('devuelve null cuando el precio viene vacío', () => {
    // 6 de los 100 productos de la API llegan así.
    expect(asPrice('')).toBeNull();
    expect(asPrice('   ')).toBeNull();
  });

  it('devuelve null en lugar de NaN para valores no numericos', () => {
    expect(asPrice('gratis')).toBeNull();
    expect(asPrice(undefined)).toBeNull();
    expect(asPrice(null)).toBeNull();
    expect(asPrice(Number.NaN)).toBeNull();
    expect(asPrice(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('acepta un número ya tipado', () => {
    expect(asPrice(170)).toBe(170);
    expect(asPrice(0)).toBe(0);
  });
});

describe('asHttpUrl', () => {
  it('acepta las direcciones de imagen que devuelve la API', () => {
    const url = 'https://itx-frontend-test.onrender.com/images/abc.jpg';

    expect(asHttpUrl(url)).toBe(url);
  });

  it('acepta http, no solo https', () => {
    expect(asHttpUrl('http://ejemplo.test/foto.jpg')).toBe('http://ejemplo.test/foto.jpg');
  });

  it('rechaza los esquemas que no deberian acabar en un atributo src', () => {
    expect(asHttpUrl('javascript:alert(1)')).toBe('');
    expect(asHttpUrl('data:image/svg+xml,<svg onload="alert(1)"/>')).toBe('');
    expect(asHttpUrl('blob:https://ejemplo.test/abc')).toBe('');
    expect(asHttpUrl('vbscript:msgbox(1)')).toBe('');
  });

  it('rechaza lo que no es una URL absoluta', () => {
    expect(asHttpUrl('/images/abc.jpg')).toBe('');
    expect(asHttpUrl('no soy una url')).toBe('');
    expect(asHttpUrl('')).toBe('');
    expect(asHttpUrl(undefined)).toBe('');
    expect(asHttpUrl(42)).toBe('');
  });
});

describe('asPositiveInteger', () => {
  it('acepta los códigos de color y capacidad de la API', () => {
    expect(asPositiveInteger(1000)).toBe(1000);
    expect(asPositiveInteger(0)).toBe(0);
  });

  it('rechaza lo que no es un entero no negativo', () => {
    expect(asPositiveInteger('1000')).toBeUndefined();
    expect(asPositiveInteger(-1)).toBeUndefined();
    expect(asPositiveInteger(10.5)).toBeUndefined();
    expect(asPositiveInteger(undefined)).toBeUndefined();
  });
});

const parseNumber = (input: unknown) => (typeof input === 'number' ? input : undefined);

describe('asArrayOf', () => {
  it('descarta los elementos que no encajan', () => {
    expect(asArrayOf([1, 'dos', 3, null], parseNumber)).toEqual([1, 3]);
  });

  it('devuelve lista vacía cuando la entrada no es un array', () => {
    expect(asArrayOf('no es array', parseNumber)).toEqual([]);
  });
});
