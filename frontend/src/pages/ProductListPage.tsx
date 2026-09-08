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
import styles from './ProductListPage.module.css';

const TRAIL: Crumb[] = [{ label: 'Productos' }];

/**
 * Constante a nivel de modulo en lugar de un `[]` en linea: un array nuevo en
 * cada renderizado invalidaria la memoizacion del filtrado.
 */
const NO_PRODUCTS: readonly ProductSummary[] = [];

/** Retardo con el que el termino de busqueda se escribe en la URL. */
const URL_SYNC_DELAY_MS = 350;

function describeResults(total: number, visible: number, query: string): string {
  if (query.trim().length === 0) {
    return total === 1 ? '1 producto' : `${String(total)} productos`;
  }
  if (visible === 0) return 'Ningun producto coincide con la busqueda';
  return visible === 1 ? '1 producto encontrado' : `${String(visible)} productos encontrados`;
}

/**
 * Vista principal: listado de productos con buscador.
 *
 * ## El termino de busqueda vive en la URL
 *
 * Se guarda en el parametro `?q=`, lo que aporta tres cosas gratis: la busqueda
 * se puede compartir por enlace, el boton de atras del navegador funciona como
 * el usuario espera, y volver desde la ficha de un producto recupera la lista
 * filtrada tal y como estaba.
 *
 * El campo mantiene ademas su propio estado local para que la escritura sea
 * inmediata, y solo la escritura en la URL va con retardo. Al reves —leer el
 * campo directamente de la URL— cada tecla provocaria una navegacion.
 */
export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const debouncedQuery = useDebouncedValue(query, URL_SYNC_DELAY_MS);

  const load = useCallback(
    (signal: AbortSignal) => fetchProductList({ signal }),
    [],
  );
  const { state, isSlow, reload } = useAsyncResource('product-list', load);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();

    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (trimmed.length === 0) next.delete('q');
        else next.set('q', trimmed);
        return next;
      },
      // `replace` para no dejar una entrada en el historial por cada busqueda:
      // el boton de atras tiene que salir de la lista, no deshacer letra a letra.
      { replace: true },
    );
  }, [debouncedQuery, setSearchParams]);

  const products = state.status === 'ready' ? state.data : NO_PRODUCTS;
  const visibleProducts = useMemo(() => filterProducts(products, query), [products, query]);

  return (
    <PageLayout trail={TRAIL}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Telefonos</h1>
          <p className={styles.subtitle}>
            Catalogo completo de dispositivos disponibles.
          </p>
        </div>

        {/* El buscador solo tiene sentido cuando hay catalogo que filtrar. */}
        {state.status === 'ready' ? (
          <SearchBar
            onChange={setQuery}
            resultsLabel={describeResults(products.length, visibleProducts.length, query)}
            value={query}
          />
        ) : null}
      </div>

      {state.status === 'loading' ? (
        <>
          {isSlow ? <SlowNotice /> : null}
          {/* Un unico anuncio del estado de carga, en lugar de uno por hueco. */}
          <p aria-live="polite" className="visually-hidden">
            Cargando el catalogo de productos
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
              Ver todo el catalogo
            </button>
          </div>
        )
      ) : null}
    </PageLayout>
  );
}
