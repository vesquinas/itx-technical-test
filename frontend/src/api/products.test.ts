import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import productDetailFixture from '../test/fixtures/productDetail.json' with { type: 'json' };
import productListFixture from '../test/fixtures/productList.json' with { type: 'json' };
import { ONE_HOUR_MS } from '../lib/cache/index.ts';
import { ApiError } from './client.ts';
import { addToCart, clearProductCache, fetchProductDetail, fetchProductList } from './products.ts';

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

    clearProductCache();
  });

  afterEach(() => {
    clearProductCache();
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

    it('fires a single request when two calls overlap in time', async () => {
      const [primera, segunda] = await Promise.all([fetchProductList(), fetchProductList()]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(primera).toEqual(segunda);
    });

    it('asks the API again after clearing the cache', async () => {
      await fetchProductList();
      clearProductCache();
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
