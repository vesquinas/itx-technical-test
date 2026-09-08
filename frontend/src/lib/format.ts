/**
 * Formatting of values for the interface.
 *
 * The `Intl` formatters are created once at module level: building an `Intl.NumberFormat` is
 * expensive, and doing it inside the render of every card is noticeable on a grid of a hundred
 * products.
 */

/**
 * The API delivers the price as a number with no unit. The euro is assumed, since that is the
 * currency of the test's market; if the API ever reported the currency, this is the only place
 * that would need changing.
 */
const priceFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export const PRICE_UNAVAILABLE = 'Precio no disponible';

/**
 * Formats the price, or returns explicit copy when there is none.
 *
 * Six of the hundred products in the API arrive with no price. Returning text instead of an empty
 * gap keeps it from looking like a loading failure.
 */
export function formatPrice(price: number | null): string {
  return price === null ? PRICE_UNAVAILABLE : priceFormatter.format(price);
}

/** The weight arrives as a number of grams with no unit: `"260"`. */
export function formatWeight(weight: string): string {
  return weight.length === 0 ? '' : `${weight} g`;
}

/**
 * Joins multi-valued fields with a readable separator.
 *
 * This is the remedy for React concatenating arrays with no separation: without it,
 * `["13 MP", "autofocus"]` renders as `"13 MPautofocus"`.
 */
export function joinSpecs(values: readonly string[]): string {
  return values.join(' · ');
}
