import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { clearProductCache } from '../api/products.ts';
import productListFixture from '../test/fixtures/productList.json' with { type: 'json' };
import { renderWithProviders } from '../test/render.tsx';
import { ProductListPage } from './ProductListPage.tsx';

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

/** Acota las consultas a la rejilla, para no contar las migas de pan. */
function productItems(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Productos' })).getAllByRole('listitem');
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ProductListPage', () => {
  let fetchMock: Mock<FetchStub>;

  beforeEach(() => {
    clearProductCache();
    fetchMock = vi.fn<FetchStub>(() => Promise.resolve(jsonResponse(productListFixture)));
    vi.stubGlobal('fetch', fetchMock);
  });

  it('muestra los productos que devuelve la API', async () => {
    renderWithProviders(<ProductListPage />);

    expect(await screen.findByRole('heading', { name: 'Iconia Talk S' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Liquid Z6' })).toBeInTheDocument();
    expect(productItems()).toHaveLength(productListFixture.length);
  });

  it('muestra el precio formateado en euros', async () => {
    renderWithProviders(<ProductListPage />);

    const precio = await screen.findByText(/170,00/);

    expect(precio).toBeInTheDocument();
  });

  it('avisa cuando la API no da precio, en lugar de dejar el hueco vacio', async () => {
    renderWithProviders(<ProductListPage />);
    await screen.findByRole('heading', { name: 'Iconia Talk S' });

    // La fixture incluye los 2 productos sin precio que trae la API real.
    expect(screen.getAllByText('Precio no disponible')).toHaveLength(2);
  });

  it('enlaza cada producto con su ficha', async () => {
    renderWithProviders(<ProductListPage />);

    const enlace = await screen.findByRole('link', { name: /Iconia Talk S/ });

    expect(enlace).toHaveAttribute('href', '/product/ZmGrkLRPXOTpxsU4jjAcv');
  });

  describe('busqueda', () => {
    it('filtra por modelo mientras se escribe', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'iconia');

      expect(screen.getByRole('heading', { name: 'Iconia Talk S' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Liquid Z6' })).not.toBeInTheDocument();
    });

    it('filtra por marca', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'acer');

      expect(productItems()).toHaveLength(productListFixture.length);
    });

    it('informa del numero de resultados', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'iconia');

      expect(screen.getByText('1 producto encontrado')).toBeInTheDocument();
    });

    it('no vuelve a llamar a la API al filtrar', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'liquid');

      // El filtrado es en cliente sobre los datos ya cargados.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('ofrece salida cuando la busqueda no encuentra nada', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'iphone');

      expect(screen.getByRole('heading', { name: 'Sin resultados' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Ver todo el catalogo' }));

      expect(screen.getByRole('heading', { name: 'Iconia Talk S' })).toBeInTheDocument();
    });

    it('arranca con el termino que trae la URL', async () => {
      renderWithProviders(<ProductListPage />, { route: '/?q=iconia' });

      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('iconia');
      expect(screen.queryByRole('heading', { name: 'Liquid Z6' })).not.toBeInTheDocument();
    });

    it('borra la busqueda con el boton del campo', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />, { route: '/?q=iconia' });
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.click(screen.getByRole('button', { name: 'Borrar la busqueda' }));

      expect(screen.getByRole('heading', { name: 'Liquid Z6' })).toBeInTheDocument();
    });
  });

  describe('fallos', () => {
    it('explica el error y permite reintentar', async () => {
      const user = userEvent.setup();
      fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('sin red')));

      renderWithProviders(<ProductListPage />);

      expect(await screen.findByRole('alert')).toHaveTextContent('No hemos podido conectar');

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(productListFixture)));
      await user.click(screen.getByRole('button', { name: 'Volver a intentarlo' }));

      expect(await screen.findByRole('heading', { name: 'Iconia Talk S' })).toBeInTheDocument();
    });

    it('avisa cuando la respuesta no tiene la forma esperada', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ productos: [] })));

      renderWithProviders(<ProductListPage />);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'La respuesta no es la esperada',
      );
    });

    it('esconde el buscador mientras no hay catalogo que filtrar', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 500)));

      renderWithProviders(<ProductListPage />);
      await screen.findByRole('alert');

      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    });
  });

  it('explica la espera cuando la primera carga se alarga', async () => {
    // La API de la prueba se aloja en un plan gratuito que apaga el servicio:
    // la primera peticion tarda unos 40 segundos en arrancarlo.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(jsonResponse(productListFixture));
          }, 45_000);
        }),
    );

    renderWithProviders(<ProductListPage />);

    expect(screen.queryByText(/despertando el servidor/)).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(3_500);

    expect(await screen.findByText(/despertando el servidor/)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(45_000);

    expect(await screen.findByRole('heading', { name: 'Iconia Talk S' })).toBeInTheDocument();
    expect(screen.queryByText(/despertando el servidor/)).not.toBeInTheDocument();
  });

  it('muestra la cesta vacia al arrancar', async () => {
    renderWithProviders(<ProductListPage />);
    await screen.findByRole('heading', { name: 'Iconia Talk S' });

    await waitFor(() => {
      expect(screen.getByText('0 articulos')).toBeInTheDocument();
    });
  });
});
