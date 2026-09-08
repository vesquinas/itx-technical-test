import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetProductCacheForTests } from '../api/products.ts';
import { forgetScrollPositions } from '../hooks/useScroll.ts';
import productDetailFixture from '../test/fixtures/productDetail.json' with { type: 'json' };
import productListFixture from '../test/fixtures/productList.json' with { type: 'json' };
import { renderWithProviders } from '../test/render.tsx';
import { ProductDetailPage } from './ProductDetailPage.tsx';
import { ProductListPage } from './ProductListPage.tsx';

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Lets React run the effects it still has pending.
 *
 * Needed because **the content being on screen does not mean the effects have run**: the products
 * appear on commit and a passive effect flushes after it. Every test here moves the scroll position
 * once the list is up, and without this the first view's restore could run after that move and see
 * a position it was never meant to see.
 */
async function flushEffects(): Promise<void> {
  await act(async () => {});
}

/** jsdom implements no scrolling, so the position is simulated to be able to assert on it. */
function pretendScrolledTo(position: number): void {
  pretendPositionIs(position);
  globalThis.dispatchEvent(new Event('scroll'));
}

/**
 * Moves the position **without** firing a scroll event.
 *
 * That is not an artificial case: it is what happens to the catalogue's remembered position while
 * the catalogue is not mounted. The detail page scrolls the document to the top, and the
 * catalogue's listener is not there to hear it.
 */
function pretendPositionIs(position: number): void {
  vi.spyOn(globalThis, 'scrollY', 'get').mockReturnValue(position);
}

/**
 * Scroll behaviour when the view changes.
 *
 * A single-page application does not reload the document, so the browser keeps the scroll position
 * across a view change. This was reported from the deployed demo: opening a product from halfway
 * down the catalogue showed the detail page already scrolled down.
 */
describe('scroll behaviour across views', () => {
  let fetchMock: Mock<FetchStub>;
  let scrollTo: Mock<(x: number, y: number) => void>;

  beforeEach(() => {
    resetProductCacheForTests();
    forgetScrollPositions();
    fetchMock = vi.fn<FetchStub>((url) =>
      Promise.resolve(
        jsonResponse(url.includes('/api/product/') ? productDetailFixture : productListFixture),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    scrollTo = vi.fn<(x: number, y: number) => void>();
    vi.stubGlobal('scrollTo', scrollTo);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // `pretendScrolledTo` spies on the `scrollY` getter, and a spy is not a stub: without this it
    // survived into the next test, which read a scroll position left behind by the previous one.
    // That is what made these tests flaky — and, worse, what masked a real defect, because a
    // leftover position of 1840 happened to be the position the next test expected.
    vi.restoreAllMocks();
  });

  describe('the product detail page', () => {
    it('opens at the top, whatever the previous view had scrolled to', async () => {
      renderWithProviders(<ProductDetailPage />, {
        route: '/product/abc123',
        path: '/product/:productId',
      });
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    });

    it('goes back to the top when a different product is opened', async () => {
      const { unmount } = renderWithProviders(<ProductDetailPage />, {
        route: '/product/abc123',
        path: '/product/:productId',
      });
      await screen.findByRole('heading', { level: 1, name: 'X960' });
      scrollTo.mockClear();

      unmount();
      renderWithProviders(<ProductDetailPage />, {
        route: '/product/other',
        path: '/product/:productId',
      });
      await screen.findByRole('heading', { level: 1, name: 'X960' });

      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    });
  });

  describe('the catalogue', () => {
    it('does not force the view to the top on arrival', async () => {
      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      // The list restores a position rather than resetting it: with nothing remembered there is
      // nothing to do, and forcing a scroll here would fight the browser.
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('returns the user to where they had left the catalogue', async () => {
      const { unmount } = renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });
      await flushEffects();

      pretendScrolledTo(1840);
      unmount();

      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      // Waited for, not asserted straight away: the products being on screen does not mean React
      // has flushed the effect that scrolls.
      await waitFor(() => {
        expect(scrollTo).toHaveBeenCalledWith(0, 1840);
      });
    });

    it('restores the position even though the page is at the top when it mounts', async () => {
      const { unmount } = renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });
      await flushEffects();
      pretendScrolledTo(1840);
      unmount();

      // The detail page took the document to the top while the catalogue was away, so the
      // catalogue mounts with the page at zero and 1840 remembered. Mounting must not overwrite
      // what was remembered — which it did, through the effect cleanup, until this test existed.
      pretendPositionIs(0);

      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });

      await waitFor(() => {
        expect(scrollTo).toHaveBeenCalledWith(0, 1840);
      });
    });

    it('does not yank the page while the user is filtering', async () => {
      const user = userEvent.setup();
      const { unmount } = renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });
      await flushEffects();
      pretendScrolledTo(1200);
      unmount();

      renderWithProviders(<ProductListPage />);
      await screen.findByRole('heading', { name: 'Iconia Talk S' });
      await waitFor(() => {
        expect(scrollTo).toHaveBeenCalledTimes(1);
      });

      // Every keystroke rewrites the URL. If the restore were not guarded, each of those would
      // drag the page back to the remembered position while the user is reading the results.
      await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'liquid');

      expect(scrollTo).toHaveBeenCalledTimes(1);
    });
  });
});
