import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import productDetailFixture from '../test/fixtures/productDetail.json' with { type: 'json' };
import productListFixture from '../test/fixtures/productList.json' with { type: 'json' };
import { ONE_HOUR_MS } from '../lib/cache/index.ts';
import { ApiError } from './client.ts';
import { addToCart, clearProductCache, fetchProductDetail, fetchProductList } from './products.ts';

/** Firma acotada de `fetch`: solo lo que la aplicación usa de verdad. */
type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('capa de datos de producto', () => {
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
    it('pide el listado a la API y lo devuelve traducido', async () => {
      const products = await fetchProductList();

      expect(products).toHaveLength(productListFixture.length);
      expect(products[0]?.model).toBe('Iconia Talk S');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://itx-frontend-test.onrender.com/api/product',
      );
    });

    it('sirve de cache la segunda vez, sin volver a la red', async () => {
      await fetchProductList();
      await fetchProductList();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('revalida contra la API cuando la entrada cacheada cumple una hora', async () => {
      await fetchProductList();

      clock += ONE_HOUR_MS;
      await fetchProductList();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('sigue usando la cache justo antes de la hora', async () => {
      await fetchProductList();

      clock += ONE_HOUR_MS - 1;
      await fetchProductList();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('lanza una sola peticion cuando dos llamadas coinciden en el tiempo', async () => {
      const [primera, segunda] = await Promise.all([fetchProductList(), fetchProductList()]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(primera).toEqual(segunda);
    });

    it('vuelve a pedir a la API despues de vaciar la cache', async () => {
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

    it('pide el detalle por identificador', async () => {
      const detail = await fetchProductDetail('abc123');

      expect(detail.model).toBe('X960');
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://itx-frontend-test.onrender.com/api/product/abc123',
      );
    });

    it('cachea cada producto por separado', async () => {
      await fetchProductDetail('abc');
      await fetchProductDetail('abc');
      await fetchProductDetail('xyz');

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('codifica el identificador para que no pueda alterar la ruta', async () => {
      await fetchProductDetail('../cart');

      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://itx-frontend-test.onrender.com/api/product/..%2Fcart',
      );
    });

    it('traduce un 404 a un error de recurso inexistente', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 404)));

      await expect(fetchProductDetail('noexiste')).rejects.toMatchObject({
        name: 'ApiError',
        kind: 'notFound',
      });
    });

    it('traduce una respuesta con forma inesperada a un error de formato', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ nada: true })));

      await expect(fetchProductDetail('abc')).rejects.toMatchObject({ kind: 'malformed' });
    });

    it('no cachea una respuesta fallida', async () => {
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

    it('envia identificador, color y capacidad, y devuelve el contador', async () => {
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

    it('no se cachea: dos pulsaciones son dos peticiones', async () => {
      await addToCart({ id: 'abc', colorCode: 1000, storageCode: 2000 });
      await addToCart({ id: 'abc', colorCode: 1000, storageCode: 2000 });

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
