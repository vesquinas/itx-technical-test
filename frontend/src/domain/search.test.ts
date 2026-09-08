import { describe, expect, it } from 'vitest';

import type { ProductSummary } from './product.ts';
import { filterProducts, normalizeForSearch } from './search.ts';

function product(brand: string, model: string): ProductSummary {
  return { id: `${brand}-${model}`, brand, model, price: 100, imageUrl: '' };
}

const catalogo: ProductSummary[] = [
  product('Acer', 'Iconia Talk S'),
  product('Acer', 'Liquid Z6'),
  product('Acer', 'Liquid Z6 Plus'),
  product('alcatel', 'Flash (2017)'),
  product('Nokia', 'Teléfono 3310'),
];

describe('normalizeForSearch', () => {
  it('pasa a minusculas', () => {
    expect(normalizeForSearch('Acer')).toBe('acer');
  });

  it('quita los diacriticos', () => {
    expect(normalizeForSearch('Teléfono')).toBe('telefono');
    expect(normalizeForSearch('ñandú')).toBe('nandu');
  });
});

describe('filterProducts', () => {
  it('devuelve el catalogo completo sin termino de busqueda', () => {
    expect(filterProducts(catalogo, '')).toHaveLength(catalogo.length);
    expect(filterProducts(catalogo, '   ')).toHaveLength(catalogo.length);
  });

  it('devuelve la misma referencia sin termino, para no renderizar de mas', () => {
    expect(filterProducts(catalogo, '')).toBe(catalogo);
  });

  it('filtra por marca', () => {
    expect(filterProducts(catalogo, 'acer')).toHaveLength(3);
  });

  it('filtra por modelo', () => {
    const resultado = filterProducts(catalogo, 'iconia');

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.model).toBe('Iconia Talk S');
  });

  it('encuentra una marca que la API escribe en minusculas', () => {
    expect(filterProducts(catalogo, 'Alcatel')).toHaveLength(1);
  });

  it('ignora los acentos, en los datos y en la busqueda', () => {
    expect(filterProducts(catalogo, 'telefono')).toHaveLength(1);
    expect(filterProducts(catalogo, 'teléfono')).toHaveLength(1);
  });

  it('exige todas las palabras, en cualquier orden', () => {
    expect(filterProducts(catalogo, 'acer liquid')).toHaveLength(2);
    expect(filterProducts(catalogo, 'liquid acer')).toHaveLength(2);
    expect(filterProducts(catalogo, 'acer nokia')).toHaveLength(0);
  });

  it('combina marca y modelo en la misma busqueda', () => {
    const resultado = filterProducts(catalogo, 'acer plus');

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.model).toBe('Liquid Z6 Plus');
  });

  it('devuelve lista vacia cuando nada encaja', () => {
    expect(filterProducts(catalogo, 'iphone')).toHaveLength(0);
  });

  it('tolera espacios de sobra alrededor y en medio', () => {
    expect(filterProducts(catalogo, '  acer   liquid  ')).toHaveLength(2);
  });
});
