import { useCallback } from 'react';
import { Link, useLocation, useParams } from 'react-router';

import { fetchProductDetail } from '../api/products.ts';
import type { Crumb } from '../components/Breadcrumbs.tsx';
import { ErrorState } from '../components/ErrorState.tsx';
import { PageLayout } from '../components/PageLayout.tsx';
import { ProductActions } from '../components/ProductActions.tsx';
import { ProductSpecs } from '../components/ProductSpecs.tsx';
import { SlowNotice } from '../components/SlowNotice.tsx';
import { useAsyncResource } from '../hooks/useAsyncResource.ts';
import { formatPrice } from '../lib/format.ts';
import styles from './ProductDetailPage.module.css';

/**
 * Vista de detalle del producto.
 *
 * Dos columnas, como indica el wireframe: la imagen a la izquierda, y a la
 * derecha las caracteristicas y las acciones. En movil se apilan.
 *
 * El enlace de vuelta conserva la búsqueda que traia el usuario (`?q=...`), de
 * modo que regresa a su lista filtrada y no al catálogo completo.
 */
export function ProductDetailPage() {
  const { productId = '' } = useParams<{ productId: string }>();
  const { search } = useLocation();

  const load = useCallback(
    (signal: AbortSignal) => fetchProductDetail(productId, { signal }),
    [productId],
  );
  const { state, isSlow, reload } = useAsyncResource(`product-${productId}`, load);

  const backTo = { pathname: '/', search };
  const productName =
    state.status === 'ready' ? `${state.data.brand} ${state.data.model}`.trim() : '';

  const trail: Crumb[] = [
    { label: 'Productos', to: `/${search}` },
    // Mientras carga se muestra un rotulo genérico: el nombre no se conoce hasta
    // que llega la respuesta, y dejar la miga vacía haría saltar la cabecera.
    { label: productName.length > 0 ? productName : 'Producto' },
  ];

  return (
    <PageLayout trail={trail}>
      <Link className={styles.back} to={backTo}>
        <span aria-hidden="true">←</span> Volver al listado
      </Link>

      {state.status === 'loading' ? (
        <>
          {isSlow ? <SlowNotice /> : null}
          <p aria-live="polite" className="visually-hidden">
            Cargando los datos del producto
          </p>
          <div className={styles.layout}>
            <div className={styles.mediaSkeleton} />
            <div className={styles.columnSkeleton}>
              <div className={styles.lineSkeleton} />
              <div className={styles.blockSkeleton} />
            </div>
          </div>
        </>
      ) : null}

      {state.status === 'error' ? (
        <div className={styles.errorArea}>
          <ErrorState error={state.error} onRetry={reload} />
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <article>
          <header className={styles.titleBlock}>
            <p className={styles.brand}>{state.data.brand}</p>
            <h1 className={styles.model}>{state.data.model}</h1>
            <p className={state.data.price === null ? styles.priceMissing : styles.price}>
              {formatPrice(state.data.price)}
            </p>
          </header>

          <div className={styles.layout}>
            {/* Primera columna: la imagen del producto. */}
            <div className={styles.media}>
              {state.data.imageUrl.length > 0 ? (
                <img
                  alt={productName}
                  className={styles.image}
                  decoding="async"
                  // Sin `lazy`: es la imagen principal de la vista y esta visible
                  // desde el primer instante, así que diferirla solo la retrasa.
                  src={state.data.imageUrl}
                />
              ) : (
                <span aria-hidden="true" className={styles.imageFallback}>
                  Sin imagen
                </span>
              )}
            </div>

            {/*
              Segunda columna: detalles y acciones, en ese orden.

              El orden lo fija el wireframe del enunciado, que sitúa el bloque de
              descripción sobre el de acciones. Comercialmente se defendería lo
              contrario —el botón de compra cuanto más arriba, mejor— pero el
              enunciado pide seguir la estructura de las capturas, y eso manda
              sobre la preferencia propia.
            */}
            <div className={styles.column}>
              <ProductSpecs product={state.data} />
              <ProductActions product={state.data} />
            </div>
          </div>
        </article>
      ) : null}
    </PageLayout>
  );
}
