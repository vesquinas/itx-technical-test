/**
 * The application's domain model.
 *
 * Deliberately NOT the shape the API returns. The API has misspelled names, two fields with their
 * contents swapped, and fields that are sometimes text and sometimes a list of texts. Translating
 * into this model at the edge (`src/api/schema.ts`) keeps those defects in one single place
 * instead of spreading them across every component.
 */

export interface ProductSummary {
  id: string;
  brand: string;
  model: string;
  /** `null` when the API gives no price, which happens in 6 of the 100 products. */
  price: number | null;
  imageUrl: string;
}

/** A selectable option: the interface shows `name`, the API expects `code`. */
export interface ProductOption {
  code: number;
  name: string;
}

export interface ProductOptions {
  colors: ProductOption[];
  storages: ProductOption[];
}

/**
 * Technical specs, already normalised: single-valued fields are `string` (empty when there is no
 * data) and multi-valued ones are `string[]` (empty list when there is no data).
 */
export interface ProductSpecs {
  cpu: string[];
  ram: string;
  operatingSystem: string[];
  chipset: string;
  gpu: string;
  /** Resolution in pixels. Careful: the API publishes it under `displaySize`. */
  screenResolution: string;
  /** Physical size in inches. Careful: the API publishes it under `displayResolution`. */
  screenSize: string;
  screenType: string;
  battery: string;
  primaryCamera: string[];
  secondaryCamera: string[];
  dimensions: string;
  /** Weight in grams, with no unit; the interface adds it. */
  weight: string;
  internalMemory: string[];
  externalMemory: string;
  sim: string[];
  networkTechnology: string;
  networkSpeed: string;
  bluetooth: string[];
  wlan: string[];
  gps: string;
  nfc: string;
  usb: string;
  audioJack: string;
  speaker: string;
  radio: string[];
  sensors: string[];
  announced: string;
  status: string;
  colors: string[];
}

export interface ProductDetail extends ProductSummary {
  specs: ProductSpecs;
  options: ProductOptions;
}

export interface CartSelection {
  id: string;
  colorCode: number;
  storageCode: number;
}

/** The text searched when filtering: brand and model, as the brief asks. */
export function searchableText(product: ProductSummary): string {
  return `${product.brand} ${product.model}`;
}
