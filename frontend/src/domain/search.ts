import type { ProductSummary } from './product.ts';
import { searchableText } from './product.ts';

/**
 * Normaliza un texto para poder compararlo.
 *
 * Pasa a minusculas y quita los diacriticos descomponiendo en NFD y eliminando
 * las marcas combinantes. Sin esto, buscar "telefono" no encontraria "teléfono",
 * que en un catalogo en espanol es un fallo que el usuario nota enseguida.
 *
 * Tambien resuelve un caso real de estos datos: la marca "alcatel" viene en
 * minusculas mientras que "Acer" viene capitalizada.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Filtra los productos por marca y modelo, como pide el enunciado.
 *
 * El termino se parte en palabras y **todas** tienen que aparecer, en cualquier
 * orden. Asi "acer liquid" encuentra el "Acer Liquid Z6", cosa que una simple
 * busqueda de subcadena no haria porque el texto completo es "Acer Liquid Z6" y
 * el usuario podria escribir "liquid acer".
 *
 * Es una funcion pura sobre un array que ya esta en memoria: no toca la red ni
 * el estado, lo que la hace trivial de probar y de memoizar.
 */
export function filterProducts(
  products: readonly ProductSummary[],
  query: string,
): readonly ProductSummary[] {
  const terms = normalizeForSearch(query).split(/\s+/).filter((term) => term.length > 0);

  // Sin terminos se devuelve el mismo array, no una copia: evita que React vea
  // una referencia nueva y vuelva a renderizar la rejilla sin motivo.
  if (terms.length === 0) return products;

  return products.filter((product) => {
    const haystack = normalizeForSearch(searchableText(product));
    return terms.every((term) => haystack.includes(term));
  });
}
