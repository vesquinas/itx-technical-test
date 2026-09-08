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
  it('lowercases', () => {
    expect(normalizeForSearch('Acer')).toBe('acer');
  });

  it('strips diacritics', () => {
    expect(normalizeForSearch('Teléfono')).toBe('telefono');
    expect(normalizeForSearch('ñandú')).toBe('nandu');
  });
});

describe('filterProducts', () => {
  it('returns the whole catalogue with no search term', () => {
    expect(filterProducts(catalogo, '')).toHaveLength(catalogo.length);
    expect(filterProducts(catalogo, '   ')).toHaveLength(catalogo.length);
  });

  it('returns the same reference with no term, to avoid rendering for nothing', () => {
    expect(filterProducts(catalogo, '')).toBe(catalogo);
  });

  it('filters by brand', () => {
    expect(filterProducts(catalogo, 'acer')).toHaveLength(3);
  });

  it('filters by model', () => {
    const resultado = filterProducts(catalogo, 'iconia');

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.model).toBe('Iconia Talk S');
  });

  it('finds a brand the API writes in lowercase', () => {
    expect(filterProducts(catalogo, 'Alcatel')).toHaveLength(1);
  });

  it('ignores accents, both in the data and in the search', () => {
    expect(filterProducts(catalogo, 'telefono')).toHaveLength(1);
    expect(filterProducts(catalogo, 'teléfono')).toHaveLength(1);
  });

  it('requires every word, in any order', () => {
    expect(filterProducts(catalogo, 'acer liquid')).toHaveLength(2);
    expect(filterProducts(catalogo, 'liquid acer')).toHaveLength(2);
    expect(filterProducts(catalogo, 'acer nokia')).toHaveLength(0);
  });

  it('combines brand and model in the same search', () => {
    const resultado = filterProducts(catalogo, 'acer plus');

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.model).toBe('Liquid Z6 Plus');
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterProducts(catalogo, 'iphone')).toHaveLength(0);
  });

  it('tolerates extra spaces around and in between', () => {
    expect(filterProducts(catalogo, '  acer   liquid  ')).toHaveLength(2);
  });
});
