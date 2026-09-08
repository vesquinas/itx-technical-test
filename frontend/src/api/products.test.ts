import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import productDetailFixture from '../test/fixtures/productDetail.json' with { type: 'json' };
import productListFixture from '../test/fixtures/productList.json' with { type: 'json' };
import { ONE_HOUR_MS } from '../lib/cache/index.ts';
import { ApiError } from './client.ts';
import { addToCart, resetProductCacheForTests, fetchProductDetail, fetchProductList } from './products.ts';

/** A narrowed signature of `fetch`: only what the application actually uses. */
type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('product data layer', () => {
  let fetchMock: Mock<FetchStub>;
  let clock: number;

  beforeEach(() => {
    clock = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);

    fetchMock = vi.fn<FetchStub>(() => Promise.resolve(jsonResponse(productListFixture)));
    vi.stubGlobal('fetch', fetchMock);

    resetProductCacheForTests();
  });

  afterEach(() => {
    resetProductCacheForTests();
    vi.unstubAllGlobals();
  });

  describe('fetchProductList', () => {
    it('requests the list from the API and returns it translated', async () => {
      const products = await fetchProductList();

      expect(products).toHaveLength(productListFixture.length);
      expect(products[0]?.model).toBe('Iconia Talk S');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://itx-frontend-test.onrender.com/api/product',
      );
    });

    it('serves from cache the second time, without going back to the network', async () => {
      await fetchProductList();
      await fetchProductList();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('revalidates against the API once the cached entry turns one hour old', async () => {
      await fetchProductList();

      clock += ONE_HOUR_MS;
      await fetchProductList();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('still uses the cache just before the hour', async () => {
      await fetchProductList();

      clock += ONE_HOUR_MS - 1;
      await fetchProductList();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    /**
     * The literal hour, on the cache the application actually configures. The two tests above take
     * it from the same constant the production code passes in, so they hold whatever it says; this
     * one guards the wiring, a second place where the hour could quietly become ten.
     */
    it('revalidates at 3,600,000 milliseconds exactly, not at whatever the constant says', async () => {
      await fetchProductList();

      clock += 3_599_999;
      await fetchProductList();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      clock += 1;
      await fetchProductList();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('fires a single request when two calls overlap in time', async () => {
      const [primera, segunda] = await Promise.all([fetchProductList(), fetchProductList()]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(primera).toEqual(segunda);
    });

    it('asks the API again after clearing the cache', async () => {
      await fetchProductList();
      resetProductCacheForTests();
      await fetchProductList();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchProductDetail', () => {
    beforeEach(() => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(productDetailFixture)));
    });

    it('requests the detail by identifier', async () => {
      const detail = await fetchProductDetail('abc123');

      expect(detail.model).toBe('X960');
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://itx-frontend-test.onrender.com/api/product/abc123',
      );
    });

    it('caches each product separately', async () => {
      await fetchProductDetail('abc');
      await fetchProductDetail('abc');
      await fetchProductDetail('xyz');

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('encodes the identifier so it cannot alter the path', async () => {
      await fetchProductDetail('../cart');

      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://itx-frontend-test.onrender.com/api/product/..%2Fcart',
      );
    });

    it('translates a 404 into a resource-not-found error', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 404)));

      await expect(fetchProductDetail('noexiste')).rejects.toMatchObject({
        name: 'ApiError',
        kind: 'notFound',
      });
    });

    it('translates an unexpectedly shaped response into a format error', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ nada: true })));

      await expect(fetchProductDetail('abc')).rejects.toMatchObject({ kind: 'malformed' });
    });

    it('does not cache a failed response', async () => {
      fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({}, 500)));

      await expect(fetchProductDetail('abc')).rejects.toBeInstanceOf(ApiError);

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(productDetailFixture)));
      await expect(fetchProductDetail('abc')).resolves.toMatchObject({ model: 'X960' });
    });
  });

  describe('addToCart', () => {
    beforeEach(() => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ count: 2 })));
    });

    it('sends identifier, colour and capacity, and returns the counter', async () => {
      const count = await addToCart({ id: 'abc', colorCode: 1000, storageCode: 2001 });

      expect(count).toBe(2);

      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(url).toBe('https://itx-frontend-test.onrender.com/api/cart');
      expect(init).toMatchObject({ method: 'POST' });
      expect(JSON.parse(String(init?.body))).toEqual({
        id: 'abc',
        colorCode: 1000,
        storageCode: 2001,
      });
    });

    it('is not cached: two presses are two requests', async () => {
      await addToCart({ id: 'abc', colorCode: 1000, storageCode: 2000 });
      await addToCart({ id: 'abc', colorCode: 1000, storageCode: 2000 });

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe('a product that does not exist', () => {
  let fetchMock: Mock<FetchStub>;

  beforeEach(() => {
    resetProductCacheForTests();
    fetchMock = vi.fn<FetchStub>(() => Promise.resolve(jsonResponse(productListFixture)));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    resetProductCacheForTests();
    vi.unstubAllGlobals();
  });

  it('is reported as absent when the cached catalogue does not contain it', async () => {
    // The real API answers 500 for a product that does not exist, never 404 — checked against
    // several made-up identifiers. Taken at face value that leaves a mistyped URL showing a
    // generic failure with a retry that can never succeed. The catalogue is better evidence than
    // the status code.
    await fetchProductList();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ message: 'boom' }, 500)));

    await expect(fetchProductDetail('does-not-exist')).rejects.toMatchObject({
      kind: 'notFound',
    });
  });

  it('is still a plain failure when the product IS in the catalogue', async () => {
    // A 500 for a product that exists is a server having a bad minute, not a missing product.
    // Reporting it as absent would tell the user the product is gone whenever the API hiccups.
    const catalogue = await fetchProductList();
    const existing = catalogue[0];
    expect(existing).toBeDefined();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ message: 'boom' }, 500)));

    await expect(fetchProductDetail(existing?.id ?? '')).rejects.toMatchObject({ kind: 'http' });
  });

  it('is a plain failure when there is no catalogue to check against', async () => {
    // Landing straight on a bad product URL. The catalogue is only read from the cache and never
    // fetched: nobody looking at an error page should wait forty seconds for a cold start just to
    // find out which error it is.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ message: 'boom' }, 500)));

    await expect(fetchProductDetail('does-not-exist')).rejects.toMatchObject({ kind: 'http' });
  });

  it('keeps a genuine 404 as absent', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 404)));

    await expect(fetchProductDetail('gone')).rejects.toMatchObject({ kind: 'notFound' });
  });
});

describe('cache round-trip', () => {
  let fetchMock: Mock<FetchStub>;
  let clock: number;

  beforeEach(() => {
    clock = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    fetchMock = vi.fn<FetchStub>(() => Promise.resolve(jsonResponse(productListFixture)));
    vi.stubGlobal('fetch', fetchMock);
    resetProductCacheForTests();
  });

  afterEach(() => {
    resetProductCacheForTests();
    vi.unstubAllGlobals();
  });

  it('returns from the cache exactly what it returned from the network', async () => {
    const fromNetwork = await fetchProductList();
    // A second module-level read: the cache is the only source now.
    const fromCache = await fetchProductList();

    expect(fromCache).toEqual(fromNetwork);
  });

  it('keeps the image addresses across a cache round-trip', async () => {
    const fromNetwork = await fetchProductList();
    const fromCache = await fetchProductList();

    expect(fromNetwork.every((p) => p.imageUrl.length > 0)).toBe(true);
    expect(fromCache.map((p) => p.imageUrl)).toEqual(fromNetwork.map((p) => p.imageUrl));
  });

  it('keeps the technical specs of a detail across a cache round-trip', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(productDetailFixture)));

    const fromNetwork = await fetchProductDetail('abc');
    const fromCache = await fetchProductDetail('abc');

    expect(fromCache).toEqual(fromNetwork);
  });
});
