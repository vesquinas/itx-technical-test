import type { ProductSummary } from './product.ts';
import { searchableText } from './product.ts';

/**
 * Normalises a text so it can be compared.
 *
 * It lowercases and strips diacritics by decomposing to NFD and removing the combining marks.
 * Without this, searching for "telefono" would not find "teléfono", which in a Spanish catalogue
 * is a defect the user notices immediately.
 *
 * It also solves a real case in this data: the brand "alcatel" arrives lowercase while "Acer"
 * arrives capitalised.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Filters the products by brand and model, as the brief asks.
 *
 * The term is split into words and **all** of them have to appear, in any order. That way "acer
 * liquid" finds the "Acer Liquid Z6", which a plain substring search would not, because the full
 * text is "Acer Liquid Z6" and the user might type "liquid acer".
 *
 * It is a pure function over an array that is already in memory: it touches neither the network
 * nor any state, which makes it trivial to test and to memoise.
 */
export function filterProducts(
  products: readonly ProductSummary[],
  query: string,
): readonly ProductSummary[] {
  const terms = normalizeForSearch(query).split(/\s+/).filter((term) => term.length > 0);

  // With no terms we return the very same array, not a copy: that keeps React from seeing a new
  // reference and re-rendering the grid for nothing.
  if (terms.length === 0) return products;

  return products.filter((product) => {
    const haystack = normalizeForSearch(searchableText(product));
    return terms.every((term) => haystack.includes(term));
  });
}
