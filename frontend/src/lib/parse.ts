/**
 * Helpers to narrow `unknown` down to concrete types.
 *
 * They are used at the two boundaries where data we do not control comes in:
 *
 *  1. The API responses.
 *  2. Whatever is read from `localStorage`, which the user can edit by hand.
 *
 * TypeScript is no help in either case: `strict` protects you from badly written code, not from
 * JSON with a different shape. The check has to happen at runtime.
 */

/** Turns an unknown input into `T`, or returns `undefined` if it does not fit. */
export type Parser<T> = (input: unknown) => T | undefined;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Sanitised text: trims and collapses repeated whitespace. */
export function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Normalises the fields the API returns sometimes as text and sometimes as a list of texts
 * (`cpu`, `sim`, `primaryCamera`, `wlan`, `sensors`…).
 *
 * Without this normalisation React renders the array by concatenating its elements with no
 * separator ("Quad-core1.3 GHz"), which is a visible defect in the interface.
 */
export function asTextList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items.map(asText).filter((item) => item.length > 0);
}

/**
 * The API delivers the price as a string, and in 6 of the 100 products it comes empty.
 *
 * We return `null` rather than `NaN` so the interface has to decide explicitly what to show when
 * there is no price.
 */
export function asPrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Accepts absolute URLs with an http or https scheme only.
 *
 * The API delivers the photo addresses, and those addresses end up in an image's `src` attribute.
 * Checking the scheme prevents a compromised — or simply mistaken — source from slipping in a
 * `javascript:`, a `data:` or a `blob:` where a photo should be. Current browsers do not execute
 * `javascript:` in an `<img>`, but relying on that is relying on the browser rather than on our
 * own code.
 *
 * Only absolute URLs are accepted because that is what this API returns across all 100 products of
 * the catalogue. A relative one is dropped, and the interface shows "Sin imagen" instead.
 */
export function asHttpUrl(value: unknown): string {
  const text = asText(value);
  if (text.length === 0) return '';

  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

/**
 * A whole number of zero or more, or nothing.
 *
 * It was called `asNonNegativeInteger`, and it accepted zero: the name was simply false, and a test
 * even asserted the behaviour the name denied. Zero is the right answer to keep — an empty cart is
 * a count of zero, and rejecting it would turn a legitimate value into "malformed" — so the name is
 * what had to change.
 */
export function asNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

/** Applies a parser to every element and drops the ones that do not fit. */
export function asArrayOf<T>(value: unknown, parse: Parser<T>): T[] {
  if (!Array.isArray(value)) return [];
  const result: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (parsed !== undefined) result.push(parsed);
  }
  return result;
}
