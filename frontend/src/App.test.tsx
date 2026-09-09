import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

import { resetProductCacheForTests } from './api/products.ts';
import { App } from './App.tsx';
import productDetailFixture from './test/fixtures/productDetail.json' with { type: 'json' };
import productListFixture from './test/fixtures/productList.json' with { type: 'json' };

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * These tests walk the whole application, with its real router and the views lazily loaded. They
 * check the wiring: that each URL leads to the view it should, and that an unknown URL does not
 * leave the page blank.
 */
describe('App', () => {
  let fetchMock: Mock<FetchStub>;

  beforeEach(() => {
    resetProductCacheForTests();
    fetchMock = vi.fn<FetchStub>((url) =>
      Promise.resolve(
        jsonResponse(url.includes('/api/product/') ? productDetailFixture : productListFixture),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  it('renders the list at the root', async () => {
    window.history.pushState({}, '', '/');

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Teléfonos' })).toBeInTheDocument();
  });

  it('renders the detail page on the product route', async () => {
    window.history.pushState({}, '', '/product/abc123');

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'X960' })).toBeInTheDocument();
  });

  it('renders an error page on an unknown URL', async () => {
    window.history.pushState({}, '', '/una/ruta/inventada');

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al listado de productos' })).toBeInTheDocument();
  });

  it('keeps the header with the cart on every view', async () => {
    window.history.pushState({}, '', '/una/ruta/inventada');

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' });

    expect(screen.getByText('Cesta')).toBeInTheDocument();
  });

  it('changes view without the document ever being re-requested, and keeps the search', async () => {
    // This is what "a SPA with client-side routing, no MPA and no SSR" means in behaviour, and it
    // replaces a test that asserted a link's `href` and proved none of it: an `href` is what an
    // MPA has too. Here the round trip is actually made — list, detail, back to the list — and two
    // things are asserted that only client-side routing gives: the URL changes, and jsdom never
    // reports the document navigation that a real anchor would trigger.
    const user = userEvent.setup();
    const jsdomErrors: unknown[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args) => {
      jsdomErrors.push(args[0]);
    });

    window.history.pushState({}, '', '/');
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    // Search first, so there is state to lose on the way back.
    await user.type(await screen.findByRole('searchbox', { name: 'Buscar' }), 'iconia');

    /**
     * Wait for the card's own link to carry the search, not merely for the URL to.
     *
     * The URL is written first and the cards re-render after it, and it is the card's `href` that
     * decides where the click goes — so waiting on the URL is waiting on a proxy for the state this
     * test needs. Under load the click landed in between: the product opened at a URL without the
     * search, its back link pointed at the bare list, and the field came back empty. Which is the
     * same lesson as elsewhere in this suite: wait for the thing you depend on.
     */
    const card = await screen.findByRole('link', { name: /Iconia Talk S/ });
    await waitFor(() => {
      expect(card).toHaveAttribute('href', expect.stringContaining('q=iconia'));
    });
    expect(window.location.search).toBe('?q=iconia');

    await user.click(card);
    await screen.findByRole('heading', { level: 1, name: 'X960' });
    expect(window.location.pathname).toBe('/product/ZmGrkLRPXOTpxsU4jjAcv');

    await user.click(screen.getByRole('link', { name: /Volver al listado/ }));
    await screen.findByRole('heading', { level: 1, name: 'Teléfonos' });

    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('iconia');
    // jsdom cannot navigate, and says so loudly when something tries. Nothing did.
    expect(jsdomErrors.filter((error) => /Not implemented: navigation/.test(String(error)))).toEqual(
      [],
    );

    consoleError.mockRestore();
  });

  it('writes the search into the URL once, not twice', async () => {
    // The second write is the bug this pins, and it needs the real router: `setSearchParams` is a
    // new function on every location, so an effect depending on it writes again after its own
    // navigation. That write is a `replace`, so a late duplicate lands after the user has clicked
    // into a product and replaces the product's history entry with the list's — the tap is undone.
    //
    // It surfaced as a test that failed once in four under load, waiting for a detail page that
    // never arrived because the application had navigated back to the list.
    const user = userEvent.setup();
    const replaceState = vi.spyOn(window.history, 'replaceState');

    window.history.pushState({}, '', '/');
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Teléfonos' });

    await user.type(await screen.findByRole('searchbox', { name: 'Buscar' }), 'iconia');
    await waitFor(() => {
      expect(window.location.search).toBe('?q=iconia');
    });

    const writes = replaceState.mock.calls.filter(([, , url]) => String(url).includes('q=iconia'));

    expect(writes).toHaveLength(1);
  });

  it('keeps the number of items in the cart at the end of the header row', async () => {
    // "In the right-hand part of the header", which is a position and not a string: the header is
    // a flex row and the cart is its last element. The previous citation for this requirement
    // asserted that the word "Cesta" appeared somewhere on a 404 page.
    window.history.pushState({}, '', '/');
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Teléfonos' });

    const header = screen.getByRole('banner');
    const row = header.firstElementChild;
    const cart = screen.getByText('Cesta').closest('p');

    expect(row).not.toBeNull();
    // Being the last child of the header's row is what "on the right" means, given that the row is
    // a flex row — which is asserted against the stylesheet in `layout.test.ts`, because jsdom
    // applies no CSS. And the element carries the number, not just the word.
    expect([...(row?.children ?? [])].at(-1)).toBe(cart);
    expect(cart).toHaveTextContent(/Cesta\s*0/);
  });

  it('makes the title of the application a link to the main view', async () => {
    // A literal requirement of the brief — "el título o el icono de la aplicación actuará como
    // enlace a la vista principal" — and it had no test, which is the same gap a review found in
    // the other figures the brief states outright.
    window.history.pushState({}, '', '/product/abc123');

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('heading', { level: 1, name: 'X960' });

    const title = screen.getByRole('link', { name: 'Ir a la lista de productos' });

    expect(title).toHaveAttribute('href', '/');
  });
});
