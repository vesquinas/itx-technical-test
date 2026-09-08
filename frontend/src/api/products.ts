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
import { ApiError, buildUrl, requestJson, requestRawJson } from './client.ts';
import { parseCartCount, parseProductDetail, parseProductList } from './schema.ts';

/**
 * Bumping this version invalidates everything cached in every browser. It has to be done when the
 * shape of what gets stored changes, or users who already have data stored would keep reading the
 * old format.
 *
 * Bumped to 2 when the cache stopped storing the translated model and started storing the API
 * response. Without the bump, anyone who had already loaded the application would keep reading
 * entries in the old shape — and reading them with the API's parser, which is the very defect
 * being fixed — for up to an hour, until they expired on their own.
 */
const CACHE_VERSION = 2;

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

/**
 * A cached read, deduplicating concurrent requests.
 *
 * **What gets cached is the API's own response, not the translated model.** That distinction is
 * not academic: `TtlCache.get` validates on read with this very parser, and the parser reads the
 * API's field names (`imgUrl`, `cpu`, `displaySize`). Caching the translated model made that
 * validation silently strip every field whose name differs — which is to say the images and the
 * entire spec sheet — so a product revisited within the hour came back gutted.
 *
 * The upside of caching the raw response is that there is a single parser and a single translation
 * point, applied identically whether the data comes from the network or from the cache. The cost
 * is translating again on every cache read, which for a hundred products is imperceptible.
 *
 * <b>The shared request takes no caller's abort signal, deliberately.</b> A deduplicated request
 * belongs to the cache and not to whoever happened to ask for it first: tying it to one consumer's
 * lifetime means the second consumer inherits the first one's cancellation. That is not
 * hypothetical — it made the application fail on its very first load, because React's strict mode
 * mounts, unmounts and remounts, and the remount joined the request the unmount had just aborted.
 *
 * So an abandoned request runs to completion and leaves its result in the cache, bounded by the
 * HTTP client's own timeout. It is the same decision the backend makes about the calls it stops
 * waiting for, and for the same reason: cancelling throws away work that was about to make the
 * next read instant.
 */
async function readCached<T>(
  key: string,
  parse: Parser<T>,
  fetchRaw: () => Promise<unknown>,
): Promise<T> {
  const cached = cache.get(key, parse);
  if (cached !== undefined) return cached;

  return inFlight.run(key, async () => {
    const raw = await fetchRaw();
    const parsed = parse(raw);
    if (parsed === undefined) {
      throw new ApiError('malformed', 'La respuesta de la API no tiene la forma esperada');
    }
    cache.set(key, raw);
    return parsed;
  });
}

export function fetchProductList(): Promise<ProductSummary[]> {
  return readCached('products', parseProductList, () =>
    requestRawJson(buildUrl(['api', 'product'])),
  );
}

export async function fetchProductDetail(id: string): Promise<ProductDetail> {
  try {
    return await readCached(`product/${id}`, parseProductDetail, () =>
      requestRawJson(buildUrl(['api', 'product', id])),
    );
  } catch (cause) {
    throw asAbsentIfTheCatalogueSaysSo(id, cause);
  }
}

/**
 * Turns a failure into "this product does not exist" when the catalogue can prove it.
 *
 * **This API answers 500 for a product that does not exist, never 404** — checked against several
 * made-up identifiers, all of them `{"message":"An Unexpected Error Occurred","code":0}`. Taken at
 * face value that leaves a mistyped URL showing a generic failure with a retry button that can
 * never succeed, and it leaves the 404 handling unreachable.
 *
 * Guessing from the status code is not an option: treating every 500 as "does not exist" would
 * tell the user a product is gone whenever the server has a bad minute. But there is better
 * evidence to hand than the status code — **the catalogue itself**. If the list of products is
 * already cached and this identifier is not in it, the product does not exist, whatever the
 * status code said.
 *
 * The catalogue is only read from the cache, never fetched: someone looking at an error page should
 * not be made to wait forty seconds for a cold start to find out what kind of error it is. So a
 * visitor who lands straight on a bad product URL still gets the generic failure. Someone who got
 * there by clicking through the catalogue — which is every path inside the application — gets the
 * right message.
 *
 * This is the same principle as everything else in this module: the API's defects are corrected at
 * the edge, in one place, rather than left for the interface to cope with.
 */
function asAbsentIfTheCatalogueSaysSo(id: string, cause: unknown): unknown {
  if (!(cause instanceof ApiError) || cause.kind === 'notFound') return cause;

  const catalogue = cache.get('products', parseProductList);
  if (catalogue === undefined) return cause;

  return catalogue.some((product) => product.id === id)
    ? cause
    : new ApiError('notFound', `El producto ${id} no está en el catálogo`, 404);
}

/**
 * Adds a product to the cart and returns the number of items in it.
 *
 * It is neither cached nor deduplicated: it is a write, and two presses of the button are two
 * distinct intentions from the user.
 */
export function addToCart(selection: CartSelection): Promise<number> {
  return requestJson(buildUrl(['api', 'cart']), parseCartCount, {
    method: 'POST',
    body: selection,
  });
}

/** Empties the product cache. Exposed so a manual refresh can be offered. */
export function clearProductCache(): void {
  cache.clear();
  inFlight.clear();
}
