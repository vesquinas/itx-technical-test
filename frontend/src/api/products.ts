/**
 * Access to the product data: API plus client-side cache.
 *
 * This is where the two previous pieces come together. The order of every read is:
 *
 *   1. Cache. If there is a valid, unexpired entry, it is served without hitting the network.
 *   2. In-flight request. If an identical request is already under way, we wait for that one
 *      instead of starting another.
 *   3. API. Request, validate, store in the cache.
 *
 * Step 2 matters more than it looks: without it, mounting two components in the same view that
 * both need the same product produces two simultaneous requests, because neither has finished yet
 * to populate the cache.
 */

import type { CartSelection, ProductDetail, ProductSummary } from '../domain/product.ts';
import type { Parser } from '../lib/parse.ts';
import { ONE_HOUR_MS, TtlCache } from '../lib/cache/index.ts';
import type { RequestOptions } from './client.ts';
import { buildUrl, requestJson } from './client.ts';
import { parseCartCount, parseProductDetail, parseProductList } from './schema.ts';

/**
 * Bumping this version invalidates everything cached in every browser. It has to be done when the
 * shape of the domain model changes, or users who already have data stored would keep reading the
 * old format.
 */
const CACHE_VERSION = 1;

const cache = new TtlCache({
  namespace: 'itx-product-cache',
  ttlMs: ONE_HOUR_MS,
  version: CACHE_VERSION,
});

/**
 * Registry of in-flight requests, so the same one is not started twice.
 *
 * The type is recovered with an assertion, confined to this single point: the key uniquely
 * determines the type of the result (`products` always resolves to `ProductSummary[]`,
 * `product/<id>` always to `ProductDetail`), so the assertion is correct by construction.
 *
 * Avoiding it by re-validating the shared promise with the same parser was tried, but that is a
 * conceptual error: the parser translates the API's shape and the promise already holds the domain
 * model, with different field names.
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

/** A cached read, deduplicating concurrent requests. */
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
 * Adds a product to the cart and returns the number of items in it.
 *
 * It is neither cached nor deduplicated: it is a write, and two presses of the button are two
 * distinct intentions from the user.
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

/** Empties the product cache. Exposed so a manual refresh can be offered. */
export function clearProductCache(): void {
  cache.clear();
  inFlight.clear();
}
