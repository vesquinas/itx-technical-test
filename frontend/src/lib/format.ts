/**
 * Formatting of values for the interface.
 *
 * The formatter is built once at module level, not per render: `Intl.NumberFormat` is expensive
 * and it shows on a grid of a hundred cards. The euro is assumed because the API sends an amount
 * with no currency; this is the one place that would change if it ever sent one.
 */
const priceFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export const PRICE_UNAVAILABLE = 'Precio no disponible';

/**
 * Formats the price, or says so when there is none — 6 of the API's 100 products have no price,
 * and an empty gap there reads as a loading failure.
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
