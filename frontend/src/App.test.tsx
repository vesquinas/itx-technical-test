import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { StrictMode } from 'react';

import { resetProductCacheForTests } from './api/products.ts';
import { App } from './App.tsx';
import productDetailFixture from './test/fixtures/productDetail.json' with { type: 'json' };
import productListFixture from './test/fixtures/productList.json' with { type: 'json' };

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * These tests walk the whole application, with its real router and the views lazily loaded. They
 * check the wiring: that each URL leads to the view it should, and that an unknown URL does not
 * leave the page blank.
 */
describe('App', () => {
  let fetchMock: Mock<FetchStub>;

  beforeEach(() => {
    resetProductCacheForTests();
    fetchMock = vi.fn<FetchStub>((url) =>
      Promise.resolve(
        jsonResponse(url.includes('/api/product/') ? productDetailFixture : productListFixture),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  it('renders the list at the root', async () => {
    window.history.pushState({}, '', '/');

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Teléfonos' })).toBeInTheDocument();
  });

  it('renders the detail page on the product route', async () => {
    window.history.pushState({}, '', '/product/abc123');

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'X960' })).toBeInTheDocument();
  });

  it('renders an error page on an unknown URL', async () => {
    window.history.pushState({}, '', '/una/ruta/inventada');

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al listado de productos' })).toBeInTheDocument();
  });

  it('keeps the header with the cart on every view', async () => {
    window.history.pushState({}, '', '/una/ruta/inventada');

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' });

    expect(screen.getByText('Cesta')).toBeInTheDocument();
  });
});
