import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { clearProductCache } from '../api/products.ts';
import productDetailFixture from '../test/fixtures/productDetail.json' with { type: 'json' };
import { renderWithProviders } from '../test/render.tsx';
import { ProductDetailPage } from './ProductDetailPage.tsx';

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The detail lives on a route with a parameter, so it has to be declared. */
function renderDetail(route = '/product/abc123') {
  return renderWithProviders(<ProductDetailPage />, { route, path: '/product/:productId' });
}

/** A product with two colours and two capacities, to exercise the selection. */
const conVariasOpciones = {
  ...productDetailFixture,
  options: {
    colors: [
      { code: 1000, name: 'Black' },
      { code: 1001, name: 'White' },
    ],
    storages: [
      { code: 2000, name: '16 GB' },
      { code: 2001, name: '32 GB' },
    ],
  },
};

describe('ProductDetailPage', () => {
  let fetchMock: Mock<FetchStub>;

  beforeEach(() => {
    clearProductCache();
    fetchMock = vi.fn<FetchStub>(() => Promise.resolve(jsonResponse(productDetailFixture)));
    vi.stubGlobal('fetch', fetchMock);
  });

  it('shows the brand, model and price of the product', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'X960' })).toBeInTheDocument();
    // The brand appears twice on purpose: above the title and in the spec sheet.
    expect(screen.getAllByText('Acer')).toHaveLength(2);
    expect(screen.getAllByText(/270,00/).length).toBeGreaterThan(0);
  });

  it('shows the image with useful alternative text', async () => {
    renderDetail();

    const imagen = await screen.findByRole('img', { name: 'Acer X960' });

    expect(imagen).toHaveAttribute('src', productDetailFixture.imgUrl);
  });

  describe('spec sheet', () => {
    it('shows every attribute the brief requires', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      for (const etiqueta of [
        'Marca',
        'Modelo',
        'Precio',
        'Procesador',
        'Memoria RAM',
        'Sistema operativo',
        'Resolución de pantalla',
        'Batería',
        'Cámara principal',
        'Cámara frontal',
        'Dimensiones',
        'Peso',
      ]) {
        expect(screen.getByText(etiqueta)).toBeInTheDocument();
      }
    });

    it('shows the resolution in pixels, undoing the swap made by the API', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      // The API publishes the pixels under `displaySize` and the inches under
      // `displayResolution`; the spec sheet has to show the pixels.
      expect(screen.getByText(productDetailFixture.displaySize)).toBeInTheDocument();
    });

    it('adds the unit to the weight', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(screen.getByText(`${productDetailFixture.weight} g`)).toBeInTheDocument();
    });

    it('shows the required attributes even when the API brings no value', async () => {
      // The brief asks to show "at least" eleven attributes, so hiding one because the API does
      // not deliver it breaks the requirement. And it is not a rare case: across the 100 products
      // of the catalogue, 1 in 5 has at least one of those eleven empty (weight is missing in 7,
      // RAM in 4, the front camera in 4).
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            ...productDetailFixture,
            weight: '',
            ram: '',
            battery: '',
            secondaryCmera: [],
          }),
        ),
      );

      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      for (const etiqueta of ['Peso', 'Memoria RAM', 'Batería', 'Cámara frontal']) {
        expect(screen.getByText(etiqueta)).toBeInTheDocument();
      }
      expect(screen.getAllByText('No disponible')).toHaveLength(4);
    });

    it('places the description above the actions, just as the wireframe does', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      const descripción = screen.getByRole('heading', { name: 'Características' });
      const acciones = screen.getByRole('group', { name: 'Color' });

      expect(
        descripción.compareDocumentPosition(acciones) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('leaves out rows with no value instead of showing them empty', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      // `nfc` arrives empty across all 100 products of the catalogue, and it is not among the
      // attributes the brief requires, so its row is not drawn.
      expect(screen.queryByText('NFC')).not.toBeInTheDocument();
    });
  });

  describe('option pickers', () => {
    it('preselects the option when there is only one', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(screen.getByRole('radio', { name: 'Black' })).toBeChecked();
      expect(screen.getByRole('radio', { name: '256 MB ROM' })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Añadir a la cesta' })).toBeEnabled();
    });

    it('allows buying a product whose option has no name', async () => {
      // M900 and DX650 deliver their only capacity with a space for a name. The option used to
      // be dropped and the product showed up as unavailable for purchase.
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            ...productDetailFixture,
            options: {
              colors: [{ code: 1000, name: 'Black' }],
              storages: [{ code: 2000, name: ' ' }],
            },
          }),
        ),
      );

      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(screen.getByRole('radio', { name: 'Estándar' })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Añadir a la cesta' })).toBeEnabled();
      expect(
        screen.queryByText(/no tiene opciones de compra disponibles/),
      ).not.toBeInTheDocument();
    });

    it('shows the picker even with a single option', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Almacenamiento' })).toBeInTheDocument();
    });

    it('requires a choice when there are several options', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(conVariasOpciones)));
      const user = userEvent.setup();
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      const boton = screen.getByRole('button', { name: 'Añadir a la cesta' });
      expect(boton).toBeDisabled();
      expect(screen.getByText('Elige almacenamiento y color para continuar.')).toBeVisible();

      await user.click(screen.getByRole('radio', { name: '32 GB' }));
      expect(boton).toBeDisabled();

      await user.click(screen.getByRole('radio', { name: 'White' }));
      expect(boton).toBeEnabled();
    });
  });

  describe('add to cart', () => {
    it('sends the selected identifier, colour and capacity', async () => {
      const user = userEvent.setup();
      renderDetail('/product/abc123');
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ count: 1 })));
      await user.click(screen.getByRole('button', { name: 'Añadir a la cesta' }));

      const ultimaLlamada = fetchMock.mock.calls.at(-1);
      expect(ultimaLlamada?.[0]).toContain('/api/cart');
      // The identifier of the loaded product is sent, not the one from the URL: if the two
      // disagreed, the good value is the one the API returned.
      expect(JSON.parse(String(ultimaLlamada?.[1]?.body))).toEqual({
        id: productDetailFixture.id,
        colorCode: 1000,
        storageCode: 2000,
      });
    });

    it('carries the counter the API returns into the header', async () => {
      const user = userEvent.setup();
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ count: 3 })));
      await user.click(screen.getByRole('button', { name: 'Añadir a la cesta' }));

      expect(await screen.findByText('3 artículos')).toBeInTheDocument();
    });

    it('persists the counter, so it survives reloading the application', async () => {
      // The brief requires persisting the cart counter. Without this test, removing the write to
      // storage broke no test at all: the requirement could have been lost in a refactor without
      // anyone noticing. It was found by injecting that very defect on purpose and checking that
      // the suite did not catch it.
      const user = userEvent.setup();
      const { unmount } = renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ count: 4 })));
      await user.click(screen.getByRole('button', { name: 'Añadir a la cesta' }));
      await screen.findByText('4 artículos');

      // Unmounting and mounting again is the equivalent of the user reloading the page: the
      // in-memory state is lost and only what was persisted remains.
      unmount();
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(productDetailFixture)));
      renderDetail();

      expect(await screen.findByText('4 artículos')).toBeInTheDocument();
    });

    it('confirms the action to the user', async () => {
      const user = userEvent.setup();
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ count: 1 })));
      await user.click(screen.getByRole('button', { name: 'Añadir a la cesta' }));

      expect(await screen.findByText('Producto añadido a la cesta.')).toBeInTheDocument();
    });

    it('locks the pickers while the request is in flight', async () => {
      // Without this, changing colour with the request under way meant that when the response
      // arrived it announced "producto añadido" for a selection other than the one sent.
      const user = userEvent.setup();
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      let resolverPeticion: (() => void) | undefined;
      fetchMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolverPeticion = () => {
              resolve(jsonResponse({ count: 1 }));
            };
          }),
      );

      await user.click(screen.getByRole('button', { name: 'Añadir a la cesta' }));

      expect(screen.getByRole('radio', { name: 'Black' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: '256 MB ROM' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Añadiendo…' })).toBeDisabled();

      resolverPeticion?.();

      expect(await screen.findByText('Producto añadido a la cesta.')).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Black' })).toBeEnabled();
    });

    it('warns if the request fails and leaves the counter alone', async () => {
      const user = userEvent.setup();
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 500)));
      await user.click(screen.getByRole('button', { name: 'Añadir a la cesta' }));

      expect(await screen.findByText(/La API respondió con el código 500/)).toBeInTheDocument();
      expect(screen.getByText('0 artículos')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('offers a link back to the list', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(screen.getByRole('link', { name: /Volver al listado/ })).toHaveAttribute(
        'href',
        '/',
      );
    });

    it('keeps the search when going back to the list', async () => {
      renderDetail('/product/abc123?q=iconia');
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(screen.getByRole('link', { name: /Volver al listado/ })).toHaveAttribute(
        'href',
        '/?q=iconia',
      );
    });

    it('shows the product name in the breadcrumbs', async () => {
      renderDetail();

      const migas = await screen.findByRole('navigation', { name: 'Ruta de navegación' });

      expect(migas).toHaveTextContent('Acer X960');
    });
  });

  describe('failures', () => {
    it('explains that the product does not exist when the API answers 404', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 404)));

      renderDetail();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No hemos encontrado este producto',
      );
    });

    it('does not offer a retry for a product that does not exist', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 404)));

      renderDetail();
      await screen.findByRole('alert');

      expect(
        screen.queryByRole('button', { name: 'Volver a intentarlo' }),
      ).not.toBeInTheDocument();
    });
  });
});
