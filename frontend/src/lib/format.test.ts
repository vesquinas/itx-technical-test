import { describe, expect, it } from 'vitest';

import { formatPrice, formatWeight, joinSpecs, PRICE_UNAVAILABLE } from './format.ts';

describe('formatPrice', () => {
  it('formatea el precio en euros con la convención española', () => {
    // Se normaliza el espacio: Intl usa un espacio duro antes del simbolo.
    expect(formatPrice(170).replace(/ /g, ' ')).toBe('170,00 €');
    expect(formatPrice(1099.5).replace(/ /g, ' ')).toBe('1099,50 €');
  });

  it('devuelve un texto explícito cuando la API no da precio', () => {
    expect(formatPrice(null)).toBe(PRICE_UNAVAILABLE);
  });

  it('formatea el precio cero en lugar de tratarlo como ausente', () => {
    expect(formatPrice(0)).not.toBe(PRICE_UNAVAILABLE);
  });
});

describe('formatWeight', () => {
  it('añade la unidad al peso en gramos', () => {
    expect(formatWeight('260')).toBe('260 g');
  });

  it('no inventa unidad cuando no hay peso', () => {
    expect(formatWeight('')).toBe('');
  });
});

describe('joinSpecs', () => {
  it('une los valores múltiples con un separador visible', () => {
    expect(joinSpecs(['13 MP', 'autofocus'])).toBe('13 MP · autofocus');
  });

  it('devuelve cadena vacía sin valores', () => {
    expect(joinSpecs([])).toBe('');
  });
});
