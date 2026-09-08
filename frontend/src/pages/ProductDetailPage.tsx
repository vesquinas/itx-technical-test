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
import { useScrollToTop } from '../hooks/useScroll.ts';
import { formatPrice } from '../lib/format.ts';
import styles from './ProductDetailPage.module.css';

/**
 * The product detail view.
 *
 * Two columns, as the wireframe shows: the image on the left, and the specs and the actions on the
 * right. On mobile they stack.
 *
 * The back link carries along the search the user arrived with (`?q=…`), so they return to their
 * filtered list rather than to the whole catalogue.
 */
export function ProductDetailPage() {
  const { productId = '' } = useParams<{ productId: string }>();
  const { search } = useLocation();

  const load = useCallback(
    (signal: AbortSignal) => fetchProductDetail(productId, { signal }),
    [productId],
  );
  const { state, isSlow, reload } = useAsyncResource(`product-${productId}`, load);

  // The view always opens at the top. Without this the browser keeps the position of whatever was
  // on screen before, so a product opened from halfway down the catalogue appeared already
  // scrolled.
  useScrollToTop(productId);

  const backTo = { pathname: '/', search };
  const productName =
    state.status === 'ready' ? `${state.data.brand} ${state.data.model}`.trim() : '';

  const trail: Crumb[] = [
    { label: 'Productos', to: `/${search}` },
    // While loading, a generic label is shown: the name is not known until the response
    // arrives, and leaving the crumb empty would make the header jump.
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
            {/* First column: the product image. */}
            <div className={styles.media}>
              {state.data.imageUrl.length > 0 ? (
                <img
                  alt={productName}
                  className={styles.image}
                  decoding="async"
                  // No `lazy`: this is the view's main image and it is visible from the very
                  // first moment, so deferring it would only delay it.
                  src={state.data.imageUrl}
                />
              ) : (
                <span aria-hidden="true" className={styles.imageFallback}>
                  Sin imagen
                </span>
              )}
            </div>

            {/*
              Second column: details and actions, in that order.

              The order comes from the brief's wireframe, which places the description block above
              the actions one. Commercially the opposite is arguable — the buy button as high as
              possible — but the brief asks to follow the structure of the screenshots, and that
              outranks personal preference.
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
