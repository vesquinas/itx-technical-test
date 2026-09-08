import { Link, useLocation } from 'react-router';

import type { ProductSummary } from '../domain/product.ts';
import { formatPrice } from '../lib/format.ts';
import styles from './ProductCard.module.css';

/**
 * A product card in the list: image, brand, model and price.
 *
 * - **One link wraps the whole card**: it is one destination, and two links would mean tabbing
 *   twice per product to reach the same page.
 * - **The image declares its aspect ratio** in CSS and loads lazily. Without reserving the space,
 *   each arriving image pushes the grid down — the defect CLS measures.
 * - **The alt text is "brand + model", not "photo of…"**: the screen reader already says it is an
 *   image.
 * - **The link carries the current search** (`?q=…`), so the detail page's back link returns to the
 *   filtered list and the URL stays shareable.
 */
export function ProductCard({ product }: { product: ProductSummary }) {
  const { search } = useLocation();
  const name = `${product.brand} ${product.model}`.trim();

  return (
    <article className={styles.card}>
      <Link className={styles.link} to={{ pathname: `/product/${product.id}`, search }}>
        <div className={styles.media}>
          {product.imageUrl.length > 0 ? (
            <img
              alt={name}
              className={styles.image}
              // `lazy` plus `async` keeps the images that are not visible yet off the critical
              // path and stops their decoding from blocking the render.
              decoding="async"
              loading="lazy"
              src={product.imageUrl}
            />
          ) : (
            <span aria-hidden="true" className={styles.imageFallback}>
              Sin imagen
            </span>
          )}
        </div>

        <div className={styles.body}>
          <p className={styles.brand}>{product.brand}</p>
          <h2 className={styles.model}>{product.model}</h2>
          <p className={product.price === null ? styles.priceMissing : styles.price}>
            {formatPrice(product.price)}
          </p>
        </div>
      </Link>
    </article>
  );
}
