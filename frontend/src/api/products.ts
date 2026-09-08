/**
 * Acceso a los datos de producto: API + cache de cliente.
 *
 * Aqui se juntan las dos piezas anteriores. El orden de cada lectura es:
 *
 *   1. Cache. Si hay entrada valida y no caducada, se sirve sin red.
 *   2. Peticion en vuelo. Si ya hay una peticion identica en curso, se espera a
 *      esa en lugar de lanzar otra.
 *   3. API. Se pide, se valida y se guarda en cache.
 *
 * El paso 2 importa mas de lo que parece: sin el, montar en la misma vista dos
 * componentes que necesiten el mismo producto genera dos peticiones simultaneas,
 * porque ninguna ha terminado todavia para poblar la cache.
 */

import type { CartSelection, ProductDetail, ProductSummary } from '../domain/product.ts';
import type { Parser } from '../lib/parse.ts';
import { ONE_HOUR_MS, TtlCache } from '../lib/cache/index.ts';
import type { RequestOptions } from './client.ts';
import { buildUrl, requestJson } from './client.ts';
import { parseCartCount, parseProductDetail, parseProductList } from './schema.ts';

/**
 * Subir esta version invalida todo lo cacheado en los navegadores. Hay que
 * hacerlo cuando cambie la forma del modelo de dominio, o los usuarios que ya
 * tengan datos guardados seguirian leyendo el formato antiguo.
 */
const CACHE_VERSION = 1;

const cache = new TtlCache({
  namespace: 'itx-product-cache',
  ttlMs: ONE_HOUR_MS,
  version: CACHE_VERSION,
});

/**
 * Registro de peticiones en curso, para no lanzar dos veces la misma.
 *
 * El tipo se recupera con una asercion, acotada a este unico punto: la clave
 * determina de forma univoca el tipo del resultado (`products` siempre resuelve
 * a `ProductSummary[]`, `product/<id>` siempre a `ProductDetail`), asi que la
 * asercion es correcta por construccion.
 *
 * Se intento evitarla revalidando la promesa compartida con el mismo parser,
 * pero es un error de concepto: el parser traduce la forma de la API y la
 * promesa ya contiene el modelo de dominio, con otros nombres de campo.
 */
class InFlightRegistry {
  private readonly pending = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing !== undefined) return existing as Promise<T>;

    const promise = task().finally(() => {
      this.pending.delete(key);
    });
    this.pending.set(key, promise);
    return promise;
  }

  clear(): void {
    this.pending.clear();
  }
}

const inFlight = new InFlightRegistry();

/** Lectura cacheada, con deduplicacion de peticiones concurrentes. */
async function readCached<T>(
  key: string,
  parse: Parser<T>,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key, parse);
  if (cached !== undefined) return cached;

  return inFlight.run(key, async () => {
    const value = await fetcher();
    cache.set(key, value);
    return value;
  });
}

export function fetchProductList(options: RequestOptions = {}): Promise<ProductSummary[]> {
  return readCached('products', parseProductList, () =>
    requestJson(buildUrl(['api', 'product']), parseProductList, options),
  );
}

export function fetchProductDetail(
  id: string,
  options: RequestOptions = {},
): Promise<ProductDetail> {
  return readCached(`product/${id}`, parseProductDetail, () =>
    requestJson(buildUrl(['api', 'product', id]), parseProductDetail, options),
  );
}

/**
 * Anade un producto a la cesta y devuelve el numero de articulos que hay en ella.
 *
 * No se cachea ni se deduplica: es una escritura, y dos pulsaciones del boton
 * son dos intenciones distintas del usuario.
 */
export function addToCart(
  selection: CartSelection,
  options: RequestOptions = {},
): Promise<number> {
  return requestJson(buildUrl(['api', 'cart']), parseCartCount, {
    ...options,
    method: 'POST',
    body: selection,
  });
}

/** Vacia la cache de productos. Se expone para poder ofrecer un refresco manual. */
export function clearProductCache(): void {
  cache.clear();
  inFlight.clear();
}
