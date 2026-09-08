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

/** The requests already under way, by cache key. */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs the task, or joins the one already running under the same key.
 *
 * The type is recovered with an assertion, confined to this single point: the key uniquely
 * determines the type of the result (`products` always resolves to `ProductSummary[]`,
 * `product/<id>` always to `ProductDetail`), so the assertion is correct by construction.
 *
 * Avoiding it by re-validating the shared promise with the same parser was tried, but that is a
 * conceptual error: the parser translates the API's shape and the promise already holds the domain
 * model, with different field names.
 */
function shared<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing !== undefined) return existing as Promise<T>;

  const promise = task().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/**
 * A cached read, deduplicating concurrent requests.
 *
 * **What gets cached is the API's own response, not the translated model.** `TtlCache.get`
 * validates on read with the parser it is given, and that parser expects the API's field names
 * (`imgUrl`, `cpu`, `displaySize`): caching the translated model made that validation silently
 * strip every differently-named field, so a product revisited within the hour came back with no
 * image and an empty spec sheet. Caching raw also keeps one parser and one translation point, at
 * the cost of translating on every cache read — imperceptible for a hundred products.
 *
 * **The shared request takes no caller's abort signal.** A deduplicated request belongs to the
 * cache, not to whoever asked first: tying it to one consumer's lifetime makes the next consumer
 * inherit that consumer's cancellation. So an abandoned request finishes and leaves its result in
 * the cache, bounded by the HTTP client's timeout — the same choice the backend makes about calls
 * it stops waiting for, because cancelling throws away work that was about to make the next read
 * instant.
 */
async function readCached<T>(
  key: string,
  parse: Parser<T>,
  fetchRaw: () => Promise<unknown>,
): Promise<T> {
  const cached = cache.get(key, parse);
  if (cached !== undefined) return cached;

  return shared(key, async () => {
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
 * This API answers **500 for a product that does not exist**, never 404, so the status code cannot
 * tell a mistyped URL from a broken server, and taking it at face value offers a retry that can
 * never succeed. The cached catalogue is better evidence: if the list is there and the identifier is
 * not in it, the product does not exist whatever the status said.
 *
 * It is read from the cache and **never fetched**, so landing straight on a bad URL still gets the
 * generic failure while clicking through the catalogue gets the right message. The accepted cost is
 * a catalogue up to an hour old: a product added since, whose detail also fails, is reported as
 * non-existent. See the README.
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

/**
 * Empties the cache and forgets the requests under way.
 *
 * Both live for the lifetime of the module, so without this one test would serve what another left
 * behind. Nothing in the application calls it, which is why the name says so.
 */
export function resetProductCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}
