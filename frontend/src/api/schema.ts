/**
 * Translation of the API responses into the domain model.
 *
 * This module is the only boundary where `unknown` is accepted and turned into typed data.
 * Anything that does not fit is dropped here, so that no component has to defend itself against
 * unexpected JSON.
 *
 * ## The real quirks of this API
 *
 * Verified against https://itx-frontend-test.onrender.com over the 100 products of the catalogue
 * and all of their details:
 *
 * 1. `dimentions` and `secondaryCmera` are misspelled at the source.
 * 2. `displayResolution` holds the inches and `displaySize` holds the pixels: their contents are
 *    swapped with respect to what their names say.
 * 3. Ten fields (`cpu`, `os`, `sim`, `primaryCamera`, `secondaryCmera`, `wlan`, `bluetooth`,
 *    `radio`, `usb`, `sensors`) arrive as text in some products and as a list of texts in others.
 * 4. `price` is always text and comes empty in 6 of the 100 products.
 * 5. `nfc` comes empty in every product of the catalogue.
 * 6. Two products deliver their only storage option with a blank name.
 */

import type {
  ProductDetail,
  ProductOption,
  ProductOptions,
  ProductSpecs,
  ProductSummary,
} from '../domain/product.ts';
import type { Parser } from '../lib/parse.ts';
import {
  asArrayOf,
  asHttpUrl,
  asNonNegativeInteger,
  asPrice,
  asText,
  asTextList,
  isRecord,
} from '../lib/parse.ts';

/** A product with no `id` is unusable: it can neither be routed to nor looked up. */
export const parseProductSummary: Parser<ProductSummary> = (input) => {
  if (!isRecord(input)) return undefined;

  const id = asText(input['id']);
  if (id.length === 0) return undefined;

  return {
    id,
    brand: asText(input['brand']),
    model: asText(input['model']),
    price: asPrice(input['price']),
    imageUrl: asHttpUrl(input['imgUrl']),
  };
};

/**
 * The list is accepted as long as it is an array, dropping the invalid elements: one corrupt
 * product must not leave the user with no catalogue.
 */
export const parseProductList: Parser<ProductSummary[]> = (input) => {
  if (!Array.isArray(input)) return undefined;
  return asArrayOf(input, parseProductSummary);
};

/**
 * An option is usable if it has a code, and only if it has a code.
 *
 * The name is the label that gets displayed; the code is what gets sent to the cart. Requiring the
 * name as well was a mistake: two products of the catalogue (`M900` and `DX650`) deliver their only
 * storage as `{ "code": 2000, "name": " " }`, with a space for a name. Dropping it made those two
 * products show up as "no purchase options available" even though the API does accept the purchase:
 * a sale lost to a labelling problem.
 *
 * The empty name is propagated as is, and it is the interface that decides what label to show. A
 * filler value is a presentation decision and has no business polluting the data model.
 */
const parseOption: Parser<ProductOption> = (input) => {
  if (!isRecord(input)) return undefined;

  const code = asNonNegativeInteger(input['code']);
  if (code === undefined) return undefined;

  return { code, name: asText(input['name']) };
};

function parseOptions(input: unknown): ProductOptions {
  const source = isRecord(input) ? input : {};
  return {
    colors: asArrayOf(source['colors'], parseOption),
    storages: asArrayOf(source['storages'], parseOption),
  };
}

function parseSpecs(source: Record<string, unknown>): ProductSpecs {
  return {
    cpu: asTextList(source['cpu']),
    ram: asText(source['ram']),
    operatingSystem: asTextList(source['os']),
    chipset: asText(source['chipset']),
    gpu: asText(source['gpu']),

    // Intentional swap: see note 2 in this module's header.
    screenResolution: asText(source['displaySize']),
    screenSize: asText(source['displayResolution']),
    screenType: asText(source['displayType']),

    battery: asText(source['battery']),
    primaryCamera: asTextList(source['primaryCamera']),
    secondaryCamera: asTextList(source['secondaryCmera']),
    dimensions: asText(source['dimentions']),
    weight: asText(source['weight']),
    internalMemory: asTextList(source['internalMemory']),
    externalMemory: asText(source['externalMemory']),
    sim: asTextList(source['sim']),
    networkTechnology: asText(source['networkTechnology']),
    networkSpeed: asText(source['networkSpeed']),
    bluetooth: asTextList(source['bluetooth']),
    wlan: asTextList(source['wlan']),
    gps: asText(source['gps']),
    nfc: asText(source['nfc']),
    usb: asText(source['usb']),
    audioJack: asText(source['audioJack']),
    speaker: asText(source['speaker']),
    radio: asTextList(source['radio']),
    sensors: asTextList(source['sensors']),
    announced: asText(source['announced']),
    status: asText(source['status']),
    colors: asTextList(source['colors']),
  };
}

export const parseProductDetail: Parser<ProductDetail> = (input) => {
  const summary = parseProductSummary(input);
  if (summary === undefined || !isRecord(input)) return undefined;

  return {
    ...summary,
    specs: parseSpecs(input),
    options: parseOptions(input['options']),
  };
};

/**
 * `POST /api/cart` answers `{ "count": n }`. It is the number of items in the cart and it is the
 * value the header shows on every view.
 */
export const parseCartCount: Parser<number> = (input) => {
  if (!isRecord(input)) return undefined;
  return asNonNegativeInteger(input['count']);
};
