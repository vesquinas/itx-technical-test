import { describe, expect, it } from 'vitest';

import { formatPrice, formatWeight, joinSpecs, PRICE_UNAVAILABLE } from './format.ts';

describe('formatPrice', () => {
  it('formats the price in euros with the Spanish convention', () => {
    // The space is normalised: Intl uses a hard space before the symbol.
    expect(formatPrice(170).replace(/ /g, ' ')).toBe('170,00 €');
    expect(formatPrice(1099.5).replace(/ /g, ' ')).toBe('1099,50 €');
  });

  it('returns explicit copy when the API gives no price', () => {
    expect(formatPrice(null)).toBe(PRICE_UNAVAILABLE);
  });

  it('formats a zero price rather than treating it as absent', () => {
    expect(formatPrice(0)).not.toBe(PRICE_UNAVAILABLE);
  });
});

describe('formatWeight', () => {
  it('adds the unit to the weight in grams', () => {
    expect(formatWeight('260')).toBe('260 g');
  });

  it('does not invent a unit when there is no weight', () => {
    expect(formatWeight('')).toBe('');
  });
});

describe('joinSpecs', () => {
  it('joins multiple values with a visible separator', () => {
    expect(joinSpecs(['13 MP', 'autofocus'])).toBe('13 MP · autofocus');
  });

  it('returns an empty string with no values', () => {
    expect(joinSpecs([])).toBe('');
  });
});
