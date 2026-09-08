import { describe, expect, it } from 'vitest';

import productDetailFixture from '../test/fixtures/productDetail.json' with { type: 'json' };
import productDetailListFieldsFixture from '../test/fixtures/productDetailListFields.json' with { type: 'json' };
import productListFixture from '../test/fixtures/productList.json' with { type: 'json' };
import {
  parseCartCount,
  parseProductDetail,
  parseProductList,
  parseProductSummary,
} from './schema.ts';

/**
 * Las fixtures son respuestas reales de la API, copiadas tal cual. Los tests de
 * este fichero valen sobre todo como documentacion ejecutable de las rarezas de
 * ese origen de datos: si algun dia la API se corrige, estos tests fallaran y
 * habra que ajustar la traduccion a proposito.
 */
describe('parseProductSummary', () => {
  it('traduce un producto real del listado', () => {
    expect(parseProductSummary(productListFixture[0])).toEqual({
      id: 'ZmGrkLRPXOTpxsU4jjAcv',
      brand: 'Acer',
      model: 'Iconia Talk S',
      price: 170,
      imageUrl: 'https://itx-frontend-test.onrender.com/images/ZmGrkLRPXOTpxsU4jjAcv.jpg',
    });
  });

  it('convierte a null el precio vacio que llega en 6 de los 100 productos', () => {
    const sinPrecio = productListFixture.find((product) => product.price === '');

    expect(sinPrecio).toBeDefined();
    expect(parseProductSummary(sinPrecio)?.price).toBeNull();
  });

  it('rechaza un producto sin id, porque no se puede enrutar ni consultar', () => {
    expect(parseProductSummary({ brand: 'Acer', model: 'X960' })).toBeUndefined();
    expect(parseProductSummary({ id: '  ', brand: 'Acer' })).toBeUndefined();
  });

  it('rechaza lo que no es un objeto', () => {
    expect(parseProductSummary(null)).toBeUndefined();
    expect(parseProductSummary('texto')).toBeUndefined();
    expect(parseProductSummary([])).toBeUndefined();
  });

  it('tolera los campos ausentes dejandolos vacios', () => {
    expect(parseProductSummary({ id: 'abc' })).toEqual({
      id: 'abc',
      brand: '',
      model: '',
      price: null,
      imageUrl: '',
    });
  });
});

describe('parseProductList', () => {
  it('traduce el listado completo', () => {
    expect(parseProductList(productListFixture)).toHaveLength(productListFixture.length);
  });

  it('descarta los elementos invalidos sin dejar al usuario sin catalogo', () => {
    const conBasura = [productListFixture[0], null, { sinId: true }, productListFixture[1]];

    expect(parseProductList(conBasura)).toHaveLength(2);
  });

  it('rechaza una respuesta que no es un array', () => {
    expect(parseProductList({ products: [] })).toBeUndefined();
  });

  it('acepta un catalogo vacio', () => {
    expect(parseProductList([])).toEqual([]);
  });
});

describe('parseProductDetail', () => {
  const detail = parseProductDetail(productDetailFixture);

  it('traduce el detalle de un producto real', () => {
    expect(detail).toBeDefined();
    expect(detail?.brand).toBe('Acer');
    expect(detail?.model).toBe('X960');
  });

  it('deshace el intercambio entre displayResolution y displaySize', () => {
    // La API publica las pulgadas bajo `displayResolution` y los pixeles bajo
    // `displaySize`, al contrario de lo que dicen sus nombres.
    expect(detail?.specs.screenResolution).toBe('480 x 640 pixels (~286 ppi pixel density)');
    expect(detail?.specs.screenSize).toBe('2.8 inches (~38.7% screen-to-body ratio)');
  });

  it('lee los campos cuyo nombre esta mal escrito en el origen', () => {
    // `dimentions` y `secondaryCmera`, tal cual los publica la API.
    expect(detail?.specs.dimensions).not.toBe('');
    expect(detail?.specs.dimensions).toBe(productDetailFixture.dimentions);
  });

  it('normaliza a lista un campo que llega como texto suelto', () => {
    expect(productDetailFixture.cpu).toBeTypeOf('string');
    expect(detail?.specs.cpu).toEqual(['533 MHz Samsung S3C 6410']);
  });

  it('normaliza a lista un campo que llega ya como lista', () => {
    const conListas = parseProductDetail(productDetailListFieldsFixture);

    expect(productDetailListFieldsFixture.cpu).toBeInstanceOf(Array);
    expect(conListas?.specs.cpu.length).toBeGreaterThan(1);
    expect(conListas?.specs.cpu.every((item) => typeof item === 'string')).toBe(true);
  });

  it('traduce las opciones de color y capacidad conservando sus codigos', () => {
    expect(detail?.options.colors).toEqual([{ code: 1000, name: 'Black' }]);
    expect(detail?.options.storages).toEqual([{ code: 2000, name: '256 MB ROM' }]);
  });

  it('descarta una opcion sin codigo, que no se podria enviar a la cesta', () => {
    const parsed = parseProductDetail({
      ...productDetailFixture,
      options: {
        colors: [{ name: 'Black' }, { code: 1001, name: 'White' }],
        storages: [{ code: '2000', name: '16 GB' }],
      },
    });

    expect(parsed?.options.colors).toEqual([{ code: 1001, name: 'White' }]);
    expect(parsed?.options.storages).toEqual([]);
  });

  it('devuelve opciones vacias cuando la API no las trae', () => {
    const parsed = parseProductDetail({ id: 'abc' });

    expect(parsed?.options).toEqual({ colors: [], storages: [] });
  });
});

describe('parseCartCount', () => {
  it('lee la respuesta de anadir a la cesta', () => {
    expect(parseCartCount({ count: 3 })).toBe(3);
    expect(parseCartCount({ count: 0 })).toBe(0);
  });

  it('rechaza una respuesta sin un contador utilizable', () => {
    expect(parseCartCount({ count: '3' })).toBeUndefined();
    expect(parseCartCount({ count: -1 })).toBeUndefined();
    expect(parseCartCount({})).toBeUndefined();
    expect(parseCartCount(null)).toBeUndefined();
  });
});
