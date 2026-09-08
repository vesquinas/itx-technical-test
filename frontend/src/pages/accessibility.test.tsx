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
 * Accessibility audit of both views, in their relevant states.
 *
 * Checking the loaded view is not enough: the loading and error states have markup of their own,
 * and they are precisely the ones usually left unchecked.
 */
describe('accessibility', () => {
  let fetchMock: Mock<FetchStub>;

  beforeEach(() => {
    clearProductCache();
    fetchMock = vi.fn<FetchStub>(() => Promise.resolve(jsonResponse(productListFixture)));
    vi.stubGlobal('fetch', fetchMock);
  });

  describe('product list', () => {
    it('has no violations with the catalogue loaded', async () => {
      const { container } = renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await expectNoAccessibilityViolations(container);
    });

    it('has no violations while loading', async () => {
      fetchMock.mockImplementation(() => new Promise(() => undefined));

      const { container } = renderWithProviders(<ProductListPage />);

      await expectNoAccessibilityViolations(container);
    });

    it('has no violations in the error state', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 500)));

      const { container } = renderWithProviders(<ProductListPage />);
      await screen.findByRole('alert');

      await expectNoAccessibilityViolations(container);
    });

    it('has no violations when the search finds nothing', async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'iphone');

      await expectNoAccessibilityViolations(container);
    });
  });

  describe('product detail page', () => {
    it('has no violations with the product loaded', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(productDetailFixture)));

      const { container } = renderWithProviders(<ProductDetailPage />, {
        route: '/product/abc123',
        path: '/product/:productId',
      });
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      await expectNoAccessibilityViolations(container);
    });

    it('has no violations when the product does not exist', async () => {
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
