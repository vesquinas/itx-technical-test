import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { fetchProductList } from '../api/products.ts';
import type { Crumb } from '../components/Breadcrumbs.tsx';
import { ErrorState } from '../components/ErrorState.tsx';
import { PageLayout } from '../components/PageLayout.tsx';
import { ProductGrid } from '../components/ProductGrid.tsx';
import { ProductGridSkeleton } from '../components/ProductGridSkeleton.tsx';
import { SearchBar } from '../components/SearchBar.tsx';
import { SlowNotice } from '../components/SlowNotice.tsx';
import type { ProductSummary } from '../domain/product.ts';
import { filterProducts } from '../domain/search.ts';
import { useAsyncResource } from '../hooks/useAsyncResource.ts';
import { useDebouncedValue } from '../hooks/useDebouncedValue.ts';
import { useRememberedScroll } from '../hooks/useScroll.ts';
import styles from './ProductListPage.module.css';

const TRAIL: Crumb[] = [{ label: 'Productos' }];

/**
 * A module-level constant rather than an inline `[]`: a new array on every render would
 * invalidate the memoisation of the filtering.
 */
const NO_PRODUCTS: readonly ProductSummary[] = [];

/**
 * Delay with which the search term is written into the URL.
 *
 * The delay is on the **URL write only**, and that is the whole of it: the products are already in
 * memory, so filtering them is instantaneous and delaying it would only make the experience worse.
 * What is worth not doing on every keystroke is pushing a navigation.
 */
const URL_SYNC_DELAY_MS = 350;

function describeResults(total: number, visible: number, query: string): string {
  if (query.trim().length === 0) {
    return total === 1 ? '1 producto' : `${String(total)} productos`;
  }
  if (visible === 0) return 'Ningún producto coincide con la búsqueda';
  return visible === 1 ? '1 producto encontrado' : `${String(visible)} productos encontrados`;
}

/**
 * The main view: the product list with its search field.
 *
 * ## The search term lives in the URL
 *
 * It is stored in the `?q=` parameter, which buys three things for free: the search can be shared
 * as a link, the browser's back button behaves the way the user expects, and coming back from a
 * product's detail page restores the filtered list exactly as it was.
 *
 * The field also keeps its own local state so typing is instant, and only the URL write is
 * delayed. The other way round — reading the field straight from the URL — would trigger a
 * navigation on every keystroke.
 */
export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const debouncedQuery = useDebouncedValue(query, URL_SYNC_DELAY_MS);

  const load = useCallback(() => fetchProductList(), []);
  const { state, isSlow, reload } = useAsyncResource('product-list', load);

  /** What the URL says right now, which is what decides whether there is anything to write. */
  const queryInUrl = searchParams.get('q') ?? '';

  useEffect(() => {
    const trimmed = debouncedQuery.trim();

    /**
     * Nothing to write when the URL already says this, and that guard is not an optimisation.
     *
     * `setSearchParams` is a **new function on every location**, so it is a dependency that changes
     * as a result of the very write this effect performs: without the guard the effect wrote the
     * same value again after its own navigation. Measured, one search produced two `replaceState`
     * calls for the same term.
     *
     * The second one is the problem. It is a `replace`, so if it lands after the user has clicked
     * into a product it **replaces the product's history entry with the list's** — the tap is
     * silently undone and they are back on the catalogue. That is what a flaky test turned out to
     * be hiding: under enough load the second write reliably landed after the click, and no amount
     * of waiting could make the detail page appear, because the application had navigated back.
     */
    if (trimmed === queryInUrl) return;

    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (trimmed.length === 0) next.delete('q');
        else next.set('q', trimmed);
        return next;
      },
      // `replace` so no history entry is left behind for every search: the back button has to
      // leave the list, not undo it letter by letter.
      { replace: true },
    );
  }, [debouncedQuery, queryInUrl, setSearchParams]);

  // Coming back from a product returns the user to where they were in the catalogue. Without it,
  // taking the detail page's "back to the list" link — which is a new navigation and not a browser
  // back — would land them at the top and lose their place in a hundred-product grid.
  useRememberedScroll('product-list', state.status === 'ready');

  const products = state.status === 'ready' ? state.data : NO_PRODUCTS;
  const visibleProducts = useMemo(() => filterProducts(products, query), [products, query]);

  return (
    <PageLayout trail={TRAIL}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Teléfonos</h1>
          <p className={styles.subtitle}>
            Catálogo completo de dispositivos disponibles.
          </p>
        </div>

        {/*
          The field is there from the first moment, and that is the brief's wording — "se mostrará
          un input al usuario" — not a preference. It used to appear only once the catalogue had
          loaded, which against this API means it was missing for the forty seconds the free
          instance takes to wake up: an undeclared departure from the letter, found in review.

          Showing it while loading also turns out to be the better behaviour here. Someone who
          knows what they are looking for can type it during the wait, and the results arrive
          already filtered. The count of results is the one part that waits, because there is
          nothing to count yet.
        */}
        <SearchBar
          onChange={setQuery}
          resultsLabel={
            state.status === 'ready'
              ? describeResults(products.length, visibleProducts.length, query)
              : ''
          }
          value={query}
        />
      </div>

      {state.status === 'loading' ? (
        <>
          {isSlow ? <SlowNotice /> : null}
          {/* One single announcement of the loading state, instead of one per placeholder. */}
          <p aria-live="polite" className="visually-hidden">
            Cargando el catálogo de productos
          </p>
          <ProductGridSkeleton />
        </>
      ) : null}

      {state.status === 'error' ? <ErrorState error={state.error} onRetry={reload} /> : null}

      {state.status === 'ready' ? (
        visibleProducts.length > 0 ? (
          <ProductGrid products={visibleProducts} />
        ) : (
          <div className={styles.empty}>
            <h2 className={styles.emptyTitle}>Sin resultados</h2>
            <p className={styles.emptyText}>
              No hay productos que coincidan con «{query.trim()}». Prueba con otra marca o
              modelo.
            </p>
            <button
              className={styles.emptyAction}
              onClick={() => {
                setQuery('');
              }}
              type="button"
            >
              Ver todo el catálogo
            </button>
          </div>
        )
      ) : null}
    </PageLayout>
  );
}
