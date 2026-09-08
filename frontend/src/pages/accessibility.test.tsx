import type { Mock } from 'vitest';
import { beforeEach, describe, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { clearProductCache } from '../api/products.ts';
import { expectNoAccessibilityViolations } from '../test/a11y.ts';
import productDetailFixture from '../test/fixtures/productDetail.json' with { type: 'json' };
import productListFixture from '../test/fixtures/productList.json' with { type: 'json' };
import { renderWithProviders } from '../test/render.tsx';
import { ProductDetailPage } from './ProductDetailPage.tsx';
import { ProductListPage } from './ProductListPage.tsx';

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Auditoría de accesibilidad de las dos vistas, en sus estados relevantes.
 *
 * No basta con comprobar la vista cargada: los estados de carga y de error tienen
 * su propio marcado, y son justamente los que se suelen dejar sin revisar.
 */
describe('accesibilidad', () => {
  let fetchMock: Mock<FetchStub>;

  beforeEach(() => {
    clearProductCache();
    fetchMock = vi.fn<FetchStub>(() => Promise.resolve(jsonResponse(productListFixture)));
    vi.stubGlobal('fetch', fetchMock);
  });

  describe('listado', () => {
    it('no tiene violaciones con el catálogo cargado', async () => {
      const { container } = renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await expectNoAccessibilityViolations(container);
    });

    it('no tiene violaciones mientras carga', async () => {
      fetchMock.mockImplementation(() => new Promise(() => undefined));

      const { container } = renderWithProviders(<ProductListPage />);

      await expectNoAccessibilityViolations(container);
    });

    it('no tiene violaciones en el estado de error', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 500)));

      const { container } = renderWithProviders(<ProductListPage />);
      await screen.findByRole('alert');

      await expectNoAccessibilityViolations(container);
    });

    it('no tiene violaciones cuando la búsqueda no encuentra nada', async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'iphone');

      await expectNoAccessibilityViolations(container);
    });
  });

  describe('ficha de producto', () => {
    it('no tiene violaciones con el producto cargado', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(productDetailFixture)));

      const { container } = renderWithProviders(<ProductDetailPage />, {
        route: '/product/abc123',
        path: '/product/:productId',
      });
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      await expectNoAccessibilityViolations(container);
    });

    it('no tiene violaciones cuando el producto no existe', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 404)));

      const { container } = renderWithProviders(<ProductDetailPage />, {
        route: '/product/abc123',
        path: '/product/:productId',
      });
      await screen.findByRole('alert');

      await expectNoAccessibilityViolations(container);
    });
  });
});
