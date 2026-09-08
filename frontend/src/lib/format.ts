/**
 * Formateo de valores para la interfaz.
 *
 * Los formateadores de `Intl` se crean una sola vez a nivel de modulo: construir
 * un `Intl.NumberFormat` es una operacion costosa y hacerlo dentro del
 * renderizado de cada tarjeta se nota en una rejilla de cien productos.
 */

/**
 * La API entrega el precio como un numero sin unidad. Se asume el euro, que es
 * la divisa del mercado de la prueba; si algun dia la API informara la divisa,
 * este es el unico punto que habria que cambiar.
 */
const priceFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export const PRICE_UNAVAILABLE = 'Precio no disponible';

/**
 * Formatea el precio, o devuelve un texto explicito cuando no hay.
 *
 * Seis de los cien productos de la API llegan sin precio. Devolver un texto en
 * lugar de un hueco vacio evita que parezca un fallo de carga.
 */
export function formatPrice(price: number | null): string {
  return price === null ? PRICE_UNAVAILABLE : priceFormatter.format(price);
}

/** El peso llega como numero en gramos y sin unidad: `"260"`. */
export function formatWeight(weight: string): string {
  return weight.length === 0 ? '' : `${weight} g`;
}

/**
 * Une los campos de valor multiple con un separador legible.
 *
 * Es el remedio al hecho de que React concatene los arrays sin separacion: sin
 * esto, `["13 MP", "autofocus"]` se pinta como `"13 MPautofocus"`.
 */
export function joinSpecs(values: readonly string[]): string {
  return values.join(' · ');
}
