/**
 * Traducción de las respuestas de la API al modelo de dominio.
 *
 * Este modulo es la única frontera donde se acepta `unknown` y se convierte en
 * datos tipados. Todo lo que no encaje se descarta aquí, de modo que ningún
 * componente tenga que defenderse de un JSON inesperado.
 *
 * ## Particularidades reales de esta API
 *
 * Verificadas contra https://itx-frontend-test.onrender.com sobre los 100
 * productos del listado y una muestra de sus detalles:
 *
 * 1. `dimentions` y `secondaryCmera` están mal escritos en el origen.
 * 2. `displayResolution` contiene las pulgadas y `displaySize` los píxeles:
 *    su contenido esta intercambiado respecto a lo que dicen sus nombres.
 * 3. Diez campos (`cpu`, `os`, `sim`, `primaryCamera`, `secondaryCmera`, `wlan`,
 *    `bluetooth`, `radio`, `usb`, `sensors`) llegan como texto en unos productos
 *    y como lista de textos en otros.
 * 4. `price` es siempre texto y viene vacío en 6 de los 100 productos.
 * 5. `nfc` viene vacío en todos los productos muestreados.
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
  asPositiveInteger,
  asPrice,
  asText,
  asTextList,
  isRecord,
} from '../lib/parse.ts';

/** Un producto sin `id` no es utilizable: no se puede enrutar ni pedir su detalle. */
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
 * El listado se acepta siempre que sea un array, descartando los elementos
 * invalidos: un producto corrupto no debe dejar al usuario sin catálogo.
 */
export const parseProductList: Parser<ProductSummary[]> = (input) => {
  if (!Array.isArray(input)) return undefined;
  return asArrayOf(input, parseProductSummary);
};

/**
 * Una opción es utilizable si tiene código, y solo si tiene código.
 *
 * El nombre es la etiqueta que se muestra; el código es lo que se envía a la cesta. Exigir
 * también el nombre fue un error: dos productos del catálogo (`M900` y `DX650`) traen su única
 * capacidad como `{ "code": 2000, "name": " " }`, con un espacio por nombre. Al descartarla, esos
 * dos productos aparecían como «sin opciones de compra disponibles» aunque la API sí permite
 * comprarlos: se perdía una venta por un problema de etiqueta.
 *
 * El nombre vacío se propaga tal cual, y es la interfaz la que decide qué rótulo poner. Un valor
 * de relleno es una decisión de presentación y no tiene por qué contaminar el modelo de datos.
 */
const parseOption: Parser<ProductOption> = (input) => {
  if (!isRecord(input)) return undefined;

  const code = asPositiveInteger(input['code']);
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

    // Intercambio intencionado: ver la nota 2 de la cabecera del modulo.
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
 * `POST /api/cart` responde `{ "count": n }`. Es el número de artículos que hay
 * en la cesta y es el dato que la cabecera muestra en todas las vistas.
 */
export const parseCartCount: Parser<number> = (input) => {
  if (!isRecord(input)) return undefined;
  return asPositiveInteger(input['count']);
};
