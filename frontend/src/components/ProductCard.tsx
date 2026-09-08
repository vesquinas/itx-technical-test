import { Link, useLocation } from 'react-router';

import type { ProductSummary } from '../domain/product.ts';
import { formatPrice } from '../lib/format.ts';
import styles from './ProductCard.module.css';

/**
 * A product card in the list: image, brand, model and price.
 *
 * ## Decisions
 *
 * - **A single link wraps the whole card.** It is one destination, so splitting it into two links
 *   (image and title) would force tabbing twice per product to reach the same place.
 *
 * - **The image is lazily loaded and declares its aspect ratio** in CSS. Without reserving the
 *   space, every image that arrives pushes the grid downwards: that is the defect the visual
 *   stability metric (CLS) measures.
 *
 * - **The alternative text is "brand + model", not "photo of…".** The screen reader already
 *   announces it is an image; repeating it is noise.
 *
 * - **The link carries the current search along** (`?q=…`). That way the detail page's back link
 *   can return the user to their filtered list rather than to the whole catalogue, and the
 *   product URL stays shareable.
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
