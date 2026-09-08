import { describe, expect, it } from 'vitest';

import {
  asArrayOf,
  asHttpUrl,
  asPositiveInteger,
  asPrice,
  asText,
  asTextList,
  isRecord,
} from './parse.ts';

describe('isRecord', () => {
  it('accepts plain objects and rejects everything else', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
    expect(isRecord('texto')).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('asText', () => {
  it('trims and collapses whitespace', () => {
    expect(asText('  Iconia   Talk  S ')).toBe('Iconia Talk S');
  });

  it('returns an empty string for anything that is not text', () => {
    expect(asText(undefined)).toBe('');
    expect(asText(null)).toBe('');
    expect(asText(42)).toBe('');
    expect(asText(['a'])).toBe('');
  });
});

describe('asTextList', () => {
  it('wraps plain text in a list', () => {
    expect(asTextList('Quad-core 1.3 GHz')).toEqual(['Quad-core 1.3 GHz']);
  });

  it('keeps lists of texts', () => {
    expect(asTextList(['13 MP', 'autofocus'])).toEqual(['13 MP', 'autofocus']);
  });

  it('drops elements that are empty or not text', () => {
    expect(asTextList(['13 MP', '', '  ', null, 7, 'autofocus'])).toEqual(['13 MP', 'autofocus']);
  });

  it('returns an empty list when there is no value', () => {
    expect(asTextList(undefined)).toEqual([]);
    expect(asTextList('')).toEqual([]);
    expect(asTextList([])).toEqual([]);
  });
});

describe('asPrice', () => {
  it('converts the text price the API returns', () => {
    expect(asPrice('170')).toBe(170);
    expect(asPrice('1099.99')).toBe(1099.99);
    expect(asPrice(' 170 ')).toBe(170);
  });

  it('returns null when the price arrives empty', () => {
    // 6 of the API's 100 products arrive like this.
    expect(asPrice('')).toBeNull();
    expect(asPrice('   ')).toBeNull();
  });

  it('returns null rather than NaN for non-numeric values', () => {
    expect(asPrice('gratis')).toBeNull();
    expect(asPrice(undefined)).toBeNull();
    expect(asPrice(null)).toBeNull();
    expect(asPrice(Number.NaN)).toBeNull();
    expect(asPrice(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('accepts an already-typed number', () => {
    expect(asPrice(170)).toBe(170);
    expect(asPrice(0)).toBe(0);
  });
});

describe('asHttpUrl', () => {
  it('accepts the image addresses the API returns', () => {
    const url = 'https://itx-frontend-test.onrender.com/images/abc.jpg';

    expect(asHttpUrl(url)).toBe(url);
  });

  it('accepts http, not only https', () => {
    expect(asHttpUrl('http://ejemplo.test/foto.jpg')).toBe('http://ejemplo.test/foto.jpg');
  });

  it('rejects the schemes that should never end up in a src attribute', () => {
    expect(asHttpUrl('javascript:alert(1)')).toBe('');
    expect(asHttpUrl('data:image/svg+xml,<svg onload="alert(1)"/>')).toBe('');
    expect(asHttpUrl('blob:https://ejemplo.test/abc')).toBe('');
    expect(asHttpUrl('vbscript:msgbox(1)')).toBe('');
  });

  it('rejects anything that is not an absolute URL', () => {
    expect(asHttpUrl('/images/abc.jpg')).toBe('');
    expect(asHttpUrl('no soy una url')).toBe('');
    expect(asHttpUrl('')).toBe('');
    expect(asHttpUrl(undefined)).toBe('');
    expect(asHttpUrl(42)).toBe('');
  });
});

describe('asPositiveInteger', () => {
  it('accepts the colour and capacity codes of the API', () => {
    expect(asPositiveInteger(1000)).toBe(1000);
    expect(asPositiveInteger(0)).toBe(0);
  });

  it('rejects anything that is not a non-negative integer', () => {
    expect(asPositiveInteger('1000')).toBeUndefined();
    expect(asPositiveInteger(-1)).toBeUndefined();
    expect(asPositiveInteger(10.5)).toBeUndefined();
    expect(asPositiveInteger(undefined)).toBeUndefined();
  });
});

const parseNumber = (input: unknown) => (typeof input === 'number' ? input : undefined);

describe('asArrayOf', () => {
  it('drops the elements that do not fit', () => {
    expect(asArrayOf([1, 'dos', 3, null], parseNumber)).toEqual([1, 3]);
  });

  it('returns an empty list when the input is not an array', () => {
    expect(asArrayOf('no es array', parseNumber)).toEqual([]);
  });
});
