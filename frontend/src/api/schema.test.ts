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
 * The fixtures are real API responses, copied verbatim. The tests in this file are worth most as
 * executable documentation of that data source's quirks: if the API is ever corrected, these tests
 * will fail and the translation will have to be adjusted on purpose.
 */
describe('parseProductSummary', () => {
  it('translates a real product from the list', () => {
    expect(parseProductSummary(productListFixture[0])).toEqual({
      id: 'ZmGrkLRPXOTpxsU4jjAcv',
      brand: 'Acer',
      model: 'Iconia Talk S',
      price: 170,
      imageUrl: 'https://itx-frontend-test.onrender.com/images/ZmGrkLRPXOTpxsU4jjAcv.jpg',
    });
  });

  it('turns into null the empty price that arrives in 6 of the 100 products', () => {
    const sinPrecio = productListFixture.find((product) => product.price === '');

    expect(sinPrecio).toBeDefined();
    expect(parseProductSummary(sinPrecio)?.price).toBeNull();
  });

  it('drops an image address with a dangerous scheme', () => {
    const parsed = parseProductSummary({
      ...productListFixture[0],
      imgUrl: 'javascript:alert(document.domain)',
    });

    // The product remains usable; what gets dropped is the image, and the interface shows
    // "Sin imagen" in its place.
    expect(parsed?.id).toBe('ZmGrkLRPXOTpxsU4jjAcv');
    expect(parsed?.imageUrl).toBe('');
  });

  it('rejects a product with no id, because it can neither be routed to nor looked up', () => {
    expect(parseProductSummary({ brand: 'Acer', model: 'X960' })).toBeUndefined();
    expect(parseProductSummary({ id: '  ', brand: 'Acer' })).toBeUndefined();
  });

  it('rejects anything that is not an object', () => {
    expect(parseProductSummary(null)).toBeUndefined();
    expect(parseProductSummary('texto')).toBeUndefined();
    expect(parseProductSummary([])).toBeUndefined();
  });

  it('tolerates missing fields by leaving them empty', () => {
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
  it('translates the whole list', () => {
    expect(parseProductList(productListFixture)).toHaveLength(productListFixture.length);
  });

  it('drops the invalid elements without leaving the user with no catalogue', () => {
    const conBasura = [productListFixture[0], null, { sinId: true }, productListFixture[1]];

    expect(parseProductList(conBasura)).toHaveLength(2);
  });

  it('rejects a response that is not an array', () => {
    expect(parseProductList({ products: [] })).toBeUndefined();
  });

  it('accepts an empty catalogue', () => {
    expect(parseProductList([])).toEqual([]);
  });
});

describe('parseProductDetail', () => {
  const detail = parseProductDetail(productDetailFixture);

  it('translates the detail of a real product', () => {
    expect(detail).toBeDefined();
    expect(detail?.brand).toBe('Acer');
    expect(detail?.model).toBe('X960');
  });

  it('undoes the swap between displayResolution and displaySize', () => {
    // The API publishes the inches under `displayResolution` and the pixels under
    // `displaySize`, the opposite of what their names say.
    expect(detail?.specs.screenResolution).toBe('480 x 640 pixels (~286 ppi pixel density)');
    expect(detail?.specs.screenSize).toBe('2.8 inches (~38.7% screen-to-body ratio)');
  });

  it('reads the fields whose names are misspelled at the source', () => {
    // `dimentions` and `secondaryCmera`, exactly as the API publishes them.
    expect(detail?.specs.dimensions).not.toBe('');
    expect(detail?.specs.dimensions).toBe(productDetailFixture.dimentions);
  });

  it('normalises to a list a field that arrives as plain text', () => {
    expect(productDetailFixture.cpu).toBeTypeOf('string');
    expect(detail?.specs.cpu).toEqual(['533 MHz Samsung S3C 6410']);
  });

  it('normalises to a list a field that already arrives as a list', () => {
    const conListas = parseProductDetail(productDetailListFieldsFixture);

    expect(productDetailListFieldsFixture.cpu).toBeInstanceOf(Array);
    expect(conListas?.specs.cpu.length).toBeGreaterThan(1);
    expect(conListas?.specs.cpu.every((item) => typeof item === 'string')).toBe(true);
  });

  it('translates the colour and capacity options keeping their codes', () => {
    expect(detail?.options.colors).toEqual([{ code: 1000, name: 'Black' }]);
    expect(detail?.options.storages).toEqual([{ code: 2000, name: '256 MB ROM' }]);
  });

  it('keeps an option whose name arrives blank but which has a code', () => {
    // This is the real case of catalogue products M900 and DX650, whose only capacity arrives as
    // { code: 2000, name: " " }. Dropping it left them unbuyable even though the API does accept
    // the purchase: the code is valid and it is the only thing that gets sent.
    const parsed = parseProductDetail({
      ...productDetailFixture,
      options: {
        colors: [{ code: 1000, name: 'Black' }],
        storages: [{ code: 2000, name: ' ' }],
      },
    });

    expect(parsed?.options.storages).toEqual([{ code: 2000, name: '' }]);
  });

  it('drops an option with no code, which could not be sent to the cart', () => {
    const parsed = parseProductDetail({
      ...productDetailFixture,
      options: {
        colors: [{ name: 'Black' }, { code: 1001, name: 'White' }],
        storages: [{ code: '2000', name: '16 GB' }],
      },
    });

    // With no code there is nothing to send to the cart, so the option is useless.
    expect(parsed?.options.colors).toEqual([{ code: 1001, name: 'White' }]);
    expect(parsed?.options.storages).toEqual([]);
  });

  it('returns empty options when the API does not provide them', () => {
    const parsed = parseProductDetail({ id: 'abc' });

    expect(parsed?.options).toEqual({ colors: [], storages: [] });
  });
});

describe('parseCartCount', () => {
  it('reads the add-to-cart response', () => {
    expect(parseCartCount({ count: 3 })).toBe(3);
    expect(parseCartCount({ count: 0 })).toBe(0);
  });

  it('rejects a response with no usable counter', () => {
    expect(parseCartCount({ count: '3' })).toBeUndefined();
    expect(parseCartCount({ count: -1 })).toBeUndefined();
    expect(parseCartCount({})).toBeUndefined();
    expect(parseCartCount(null)).toBeUndefined();
  });
});
