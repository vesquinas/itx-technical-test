import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';

import { clearProductCache } from './api/products.ts';
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
 * Estos tests recorren la aplicacion completa, con su enrutador real y las
 * vistas cargadas en diferido. Comprueban el cableado: que cada URL lleva a la
 * vista que le corresponde y que una URL desconocida no deja la pagina en blanco.
 */
describe('App', () => {
  let fetchMock: Mock<FetchStub>;

  beforeEach(() => {
    clearProductCache();
    fetchMock = vi.fn<FetchStub>((url) =>
      Promise.resolve(
        jsonResponse(url.includes('/api/product/') ? productDetailFixture : productListFixture),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  it('muestra el listado en la raiz', async () => {
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Telefonos' })).toBeInTheDocument();
  });

  it('muestra la ficha en la ruta del producto', async () => {
    window.history.pushState({}, '', '/product/abc123');

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'X960' })).toBeInTheDocument();
  });

  it('muestra una pagina de error ante una URL desconocida', async () => {
    window.history.pushState({}, '', '/una/ruta/inventada');

    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pagina no encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al listado de productos' })).toBeInTheDocument();
  });

  it('mantiene la cabecera con la cesta en todas las vistas', async () => {
    window.history.pushState({}, '', '/una/ruta/inventada');

    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Pagina no encontrada' });

    expect(screen.getByText('Cesta')).toBeInTheDocument();
  });
});
