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

/** El detalle vive en una ruta con parámetro, así que hay que declararla. */
function renderDetail(route = '/product/abc123') {
  return renderWithProviders(<ProductDetailPage />, { route, path: '/product/:productId' });
}

/** Producto con dos colores y dos capacidades, para probar la selección. */
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

  it('muestra marca, modelo y precio del producto', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'X960' })).toBeInTheDocument();
    // La marca aparece dos veces a propósito: sobre el titulo y en la ficha.
    expect(screen.getAllByText('Acer')).toHaveLength(2);
    expect(screen.getAllByText(/270,00/).length).toBeGreaterThan(0);
  });

  it('muestra la imagen con un texto alternativo útil', async () => {
    renderDetail();

    const imagen = await screen.findByRole('img', { name: 'Acer X960' });

    expect(imagen).toHaveAttribute('src', productDetailFixture.imgUrl);
  });

  describe('ficha tecnica', () => {
    it('muestra todos los atributos que exige el enunciado', async () => {
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

    it('muestra la resolución en píxeles, deshaciendo el intercambio de la API', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      // La API publica los píxeles bajo `displaySize` y las pulgadas bajo
      // `displayResolution`; la ficha tiene que mostrar los píxeles.
      expect(screen.getByText(productDetailFixture.displaySize)).toBeInTheDocument();
    });

    it('añade la unidad al peso', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(screen.getByText(`${productDetailFixture.weight} g`)).toBeInTheDocument();
    });

    it('muestra los atributos obligatorios aunque la API no traiga su valor', async () => {
      // El enunciado pide mostrar «al menos» once atributos, así que ocultar uno
      // porque la API no lo trae incumple el requisito. Y no es un caso raro:
      // sobre los 100 productos del catálogo, 1 de cada 5 tiene al menos uno de
      // esos once vacío (el peso falta en 7, la RAM en 4, la camara frontal en 4).
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

    it('coloca la descripción sobre las acciones, como el wireframe del enunciado', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      const descripción = screen.getByRole('heading', { name: 'Características' });
      const acciones = screen.getByRole('group', { name: 'Color' });

      expect(
        descripción.compareDocumentPosition(acciones) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('omite las filas sin valor en lugar de dejarlas vacías', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      // `nfc` llega vacío en los 100 productos del catálogo, y no esta entre los
      // atributos que el enunciado exige, así que su fila no se dibuja.
      expect(screen.queryByText('NFC')).not.toBeInTheDocument();
    });
  });

  describe('selectores', () => {
    it('preselecciona la opción cuando solo hay una', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(screen.getByRole('radio', { name: 'Black' })).toBeChecked();
      expect(screen.getByRole('radio', { name: '256 MB ROM' })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Añadir a la cesta' })).toBeEnabled();
    });

    it('muestra el selector aunque haya una sola opción', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Almacenamiento' })).toBeInTheDocument();
    });

    it('exige elegir cuando hay varias opciones', async () => {
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

  describe('añadir a la cesta', () => {
    it('envia identificador, color y capacidad seleccionados', async () => {
      const user = userEvent.setup();
      renderDetail('/product/abc123');
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ count: 1 })));
      await user.click(screen.getByRole('button', { name: 'Añadir a la cesta' }));

      const ultimaLlamada = fetchMock.mock.calls.at(-1);
      expect(ultimaLlamada?.[0]).toContain('/api/cart');
      // Se envía el identificador del producto cargado, no el de la URL: si
      // ambos discreparan, el dato bueno es el que ha devuelto la API.
      expect(JSON.parse(String(ultimaLlamada?.[1]?.body))).toEqual({
        id: productDetailFixture.id,
        colorCode: 1000,
        storageCode: 2000,
      });
    });

    it('lleva a la cabecera el contador que devuelve la API', async () => {
      const user = userEvent.setup();
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ count: 3 })));
      await user.click(screen.getByRole('button', { name: 'Añadir a la cesta' }));

      expect(await screen.findByText('3 artículos')).toBeInTheDocument();
    });

    it('confirma la acción al usuario', async () => {
      const user = userEvent.setup();
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ count: 1 })));
      await user.click(screen.getByRole('button', { name: 'Añadir a la cesta' }));

      expect(await screen.findByText('Producto añadido a la cesta.')).toBeInTheDocument();
    });

    it('bloquea los selectores mientras la petición está en vuelo', async () => {
      // Sin esto, cambiar de color con la petición en curso hacia que al llegar la respuesta
      // se anunciara "producto añadido" para una selección distinta de la que se envio.
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

    it('avisa si la petición falla y no toca el contador', async () => {
      const user = userEvent.setup();
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 500)));
      await user.click(screen.getByRole('button', { name: 'Añadir a la cesta' }));

      expect(await screen.findByText(/La API respondió con el código 500/)).toBeInTheDocument();
      expect(screen.getByText('0 artículos')).toBeInTheDocument();
    });
  });

  describe('navegación', () => {
    it('ofrece un enlace de vuelta al listado', async () => {
      renderDetail();
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(screen.getByRole('link', { name: /Volver al listado/ })).toHaveAttribute(
        'href',
        '/',
      );
    });

    it('conserva la búsqueda al volver al listado', async () => {
      renderDetail('/product/abc123?q=iconia');
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(screen.getByRole('link', { name: /Volver al listado/ })).toHaveAttribute(
        'href',
        '/?q=iconia',
      );
    });

    it('muestra el nombre del producto en las migas de pan', async () => {
      renderDetail();

      const migas = await screen.findByRole('navigation', { name: 'Ruta de navegación' });

      expect(migas).toHaveTextContent('Acer X960');
    });
  });

  describe('fallos', () => {
    it('explica que el producto no existe cuando la API responde 404', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 404)));

      renderDetail();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No hemos encontrado este producto',
      );
    });

    it('no ofrece reintentar ante un producto inexistente', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 404)));

      renderDetail();
      await screen.findByRole('alert');

      expect(
        screen.queryByRole('button', { name: 'Volver a intentarlo' }),
      ).not.toBeInTheDocument();
    });
  });
});
