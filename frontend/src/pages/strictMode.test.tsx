import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

import { clearProductCache } from '../api/products.ts';
import { abortAwareJson } from '../test/fetchStub.ts';
import productListFixture from '../test/fixtures/productList.json' with { type: 'json' };
import { renderWithProviders } from '../test/render.tsx';
import { ProductListPage } from './ProductListPage.tsx';

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The application has to survive strict mode's mount-unmount-remount, because that is what every
 * developer running `npm start` gets on the very first load.
 *
 * These tests use a `fetch` stub that honours the `AbortSignal`, since that is where the defect
 * lived: the unmount aborted the in-flight request, and the remount joined that same request and
 * inherited the abort. What the user saw was "Algo ha ido mal" instead of the catalogue, with no
 * way of recovering short of a reload.
 */
describe('under strict mode', () => {
  let fetchMock: Mock<FetchStub>;

  beforeEach(() => {
    clearProductCache();
    fetchMock = vi.fn<FetchStub>(abortAwareJson(productListFixture));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the catalogue on the very first load', async () => {
    renderWithProviders(<ProductListPage />);

    expect(await screen.findByRole('heading', { name: 'Iconia Talk S' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not report an error the user cannot act on', async () => {
    renderWithProviders(<ProductListPage />);
    await screen.findByRole('heading', { name: 'Iconia Talk S' });

    expect(screen.queryByText('Algo ha ido mal')).not.toBeInTheDocument();
  });
});
