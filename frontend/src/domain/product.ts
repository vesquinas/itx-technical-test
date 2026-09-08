/**
 * Modelo de dominio de la aplicación.
 *
 * Deliberadamente NO es la forma que devuelve la API. La API tiene nombres mal
 * escritos, dos campos con el contenido intercambiado y campos que a veces son
 * texto y a veces lista de textos. Traducir a este modelo en el borde
 * (`src/api/schema.ts`) mantiene esos defectos en un único sitio en lugar de
 * repartirlos por todos los componentes.
 */

export interface ProductSummary {
  id: string;
  brand: string;
  model: string;
  /** `null` cuando la API no da precio, que ocurre en 6 de los 100 productos. */
  price: number | null;
  imageUrl: string;
}

/** Opción seleccionable: la interfaz muestra `name`, la API espera `code`. */
export interface ProductOption {
  code: number;
  name: string;
}

export interface ProductOptions {
  colors: ProductOption[];
  storages: ProductOption[];
}

/**
 * Caracteristicas tecnicas ya normalizadas: los campos de valor único son
 * `string` (cadena vacía si no hay dato) y los de valor multiple son `string[]`
 * (lista vacía si no hay dato).
 */
export interface ProductSpecs {
  cpu: string[];
  ram: string;
  operatingSystem: string[];
  chipset: string;
  gpu: string;
  /** Resolución en píxeles. Ojo: la API la publica bajo `displaySize`. */
  screenResolution: string;
  /** Tamaño físico en pulgadas. Ojo: la API lo publica bajo `displayResolution`. */
  screenSize: string;
  screenType: string;
  battery: string;
  primaryCamera: string[];
  secondaryCamera: string[];
  dimensions: string;
  /** Peso en gramos, sin unidad; la interfaz la añade. */
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

/** Texto que se busca al filtrar: marca y modelo, como pide el enunciado. */
export function searchableText(product: ProductSummary): string {
  return `${product.brand} ${product.model}`;
}
