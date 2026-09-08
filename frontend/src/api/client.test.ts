import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildUrl } from './client.ts';

/**
 * The base URL resolution is what allows development to go through the development server's proxy,
 * and the proxy is what makes the cart work: the API keeps the basket in a session cookie, and a
 * browser only sends that cookie on same-origin requests. If a relative base stopped resolving
 * against the page's origin, the cart would quietly go back to being stuck at one item.
 */
describe('buildUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the API of the test brief when nothing is configured', () => {
    expect(buildUrl(['api', 'product'])).toBe(
      'https://itx-frontend-test.onrender.com/api/product',
    );
  });

  it('honours an absolute base URL', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test/gateway');

    expect(buildUrl(['api', 'product'])).toBe('https://example.test/gateway/api/product');
  });

  it("resolves a relative base against the page's own origin, which is what the proxy needs", () => {
    vi.stubEnv('VITE_API_BASE_URL', '/');

    expect(buildUrl(['api', 'cart'])).toBe(`${globalThis.location.origin}/api/cart`);
  });

  it('resolves a relative base with a prefix', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/upstream/');

    expect(buildUrl(['api', 'cart'])).toBe(`${globalThis.location.origin}/upstream/api/cart`);
  });

  it('encodes every segment, so an identifier cannot alter the path', () => {
    expect(buildUrl(['api', 'product', '../cart'])).toBe(
      'https://itx-frontend-test.onrender.com/api/product/..%2Fcart',
    );
  });
});
