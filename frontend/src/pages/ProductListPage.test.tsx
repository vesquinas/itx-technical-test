import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetProductCacheForTests } from '../api/products.ts';
import productListFixture from '../test/fixtures/productList.json' with { type: 'json' };
import { renderWithProviders } from '../test/render.tsx';
import { ProductListPage } from './ProductListPage.tsx';

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

/** Narrows the queries to the grid, so the breadcrumbs are not counted. */
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
    resetProductCacheForTests();
    fetchMock = vi.fn<FetchStub>(() => Promise.resolve(jsonResponse(productListFixture)));
    vi.stubGlobal('fetch', fetchMock);
  });

  it('shows the products the API returns', async () => {
    renderWithProviders(<ProductListPage />);

    expect(await screen.findByRole('heading', { name: 'Iconia Talk S' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Liquid Z6' })).toBeInTheDocument();
    expect(productItems()).toHaveLength(productListFixture.length);
  });

  it('shows the price formatted in euros', async () => {
    renderWithProviders(<ProductListPage />);

    const precio = await screen.findByText(/170,00/);

    expect(precio).toBeInTheDocument();
  });

  it('says so when the API gives no price, instead of leaving a gap', async () => {
    renderWithProviders(<ProductListPage />);
    await screen.findByRole('heading', { name: 'Iconia Talk S' });

    // The fixture includes the 2 products with no price that the real API delivers.
    expect(screen.getAllByText('Precio no disponible')).toHaveLength(2);
  });

  it('links every product to its detail page', async () => {
    renderWithProviders(<ProductListPage />);

    const enlace = await screen.findByRole('link', { name: /Iconia Talk S/ });

    expect(enlace).toHaveAttribute('href', '/product/ZmGrkLRPXOTpxsU4jjAcv');
  });

  describe('search', () => {
    it('filters by model while typing', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'iconia');

      expect(screen.getByRole('heading', { name: 'Iconia Talk S' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Liquid Z6' })).not.toBeInTheDocument();
    });

    it('filters by brand', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'acer');

      expect(productItems()).toHaveLength(productListFixture.length);
    });

    it('reports the number of results', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'iconia');

      expect(screen.getByText('1 producto encontrado')).toBeInTheDocument();
    });

    it('does not call the API again when filtering', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'liquid');

      // Filtering happens on the client over the already-loaded data.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('offers a way out when the search finds nothing', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'iphone');

      expect(screen.getByRole('heading', { name: 'Sin resultados' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Ver todo el catálogo' }));

      expect(screen.getByRole('heading', { name: 'Iconia Talk S' })).toBeInTheDocument();
    });

    it('starts with the term carried by the URL', async () => {
      renderWithProviders(<ProductListPage />, { route: '/?q=iconia' });

      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('iconia');
      expect(screen.queryByRole('heading', { name: 'Liquid Z6' })).not.toBeInTheDocument();
    });

    it('clears the search with the button in the field', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ProductListPage />, { route: '/?q=iconia' });
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await user.click(screen.getByRole('button', { name: 'Borrar la búsqueda' }));

      expect(screen.getByRole('heading', { name: 'Liquid Z6' })).toBeInTheDocument();
    });
  });

  describe('failures', () => {
    it('explains the error and allows retrying', async () => {
      const user = userEvent.setup();
      fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('sin red')));

      renderWithProviders(<ProductListPage />);

      expect(await screen.findByRole('alert')).toHaveTextContent('No hemos podido conectar');

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(productListFixture)));
      await user.click(screen.getByRole('button', { name: 'Volver a intentarlo' }));

      expect(await screen.findByRole('heading', { name: 'Iconia Talk S' })).toBeInTheDocument();
    });

    it('says so when the response does not have the expected shape', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ productos: [] })));

      renderWithProviders(<ProductListPage />);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'La respuesta no es la esperada',
      );
    });

    it('offers the search field from the first moment, before the catalogue has arrived', async () => {
      // The brief says the input is shown, full stop. It used to appear only with the catalogue
      // loaded, which against this API means forty seconds without it while the free instance
      // wakes up — a departure from the letter that no one had declared.
      let resolve: ((response: Response) => void) | undefined;
      fetchMock.mockImplementation(
        () =>
          new Promise<Response>((keep) => {
            resolve = keep;
          }),
      );

      renderWithProviders(<ProductListPage />);

      const field = await screen.findByRole('searchbox', { name: 'Buscar' });
      expect(field).toBeEnabled();

      // And what is typed during the wait is applied as soon as the data lands.
      await userEvent.type(field, 'iconia');
      resolve?.(jsonResponse(productListFixture));

      expect(await screen.findByRole('heading', { name: 'Iconia Talk S' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Liquid Z6' })).not.toBeInTheDocument();
    });

    it('keeps the field on the error page, so a retry is not the only way back', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 500)));

      renderWithProviders(<ProductListPage />);
      await screen.findByRole('alert');

      expect(screen.getByRole('searchbox', { name: 'Buscar' })).toBeInTheDocument();
    });
  });

  it('explains the wait when the first load drags on', async () => {
    // The test API sits on a free tier that shuts the service down: the first request takes
    // about 40 seconds to start it up.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve?.(jsonResponse(productListFixture));
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

  it('still shows the images after leaving the view and coming back', async () => {
    // This is the exact journey that surfaced a real defect on the deployed demo: open a
    // product, press back, and the images were gone. The list came from the cache, and the
    // cache was validating what it stored with the API's parser while storing the translated
    // model, so every field whose name differs — the images among them — was silently dropped.
    const [firstProduct] = productListFixture;
    if (firstProduct === undefined) throw new Error('the fixture needs at least one product');

    const { unmount } = renderWithProviders(<ProductListPage />);
    const firstVisit = await screen.findByRole('img', { name: 'Acer Iconia Talk S' });
    expect(firstVisit).toHaveAttribute('src', firstProduct.imgUrl);

    // Unmounting and mounting again is what going back to the list does: the second render is
    // served from the cache, with no network involved.
    unmount();
    renderWithProviders(<ProductListPage />);

    const secondVisit = await screen.findByRole('img', { name: 'Acer Iconia Talk S' });
    expect(secondVisit).toHaveAttribute('src', firstProduct.imgUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Sin imagen')).not.toBeInTheDocument();
  });

  it('shows an empty cart on start-up', async () => {
    renderWithProviders(<ProductListPage />);
    await screen.findByRole('heading', { name: 'Iconia Talk S' });

    await waitFor(() => {
      expect(screen.getByText('0 artículos')).toBeInTheDocument();
    });
  });
});
