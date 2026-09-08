import type { ProductSummary } from '../domain/product.ts';
import { ProductCard } from './ProductCard.tsx';
import styles from './ProductGrid.module.css';

/**
 * The product grid.
 *
 * It is a list (`ul`/`li`) and not a handful of `div`s: the screen reader announces "list of 100
 * items" and lets the user traverse it as such.
 *
 * The grid goes up to four columns, as the brief asks, and drops to three, two and one depending
 * on the available width. Explicit breakpoints are used instead of `auto-fill` because `auto-fill`
 * offers no way to cap the number of columns, and on a wide screen it would go past four.
 *
 * It is not virtualised: there are 100 products. Virtualising here would add a dependency, break
 * the browser's find-in-page and complicate accessibility, to solve a problem that does not exist
 * at this scale.
 */
export function ProductGrid({ products }: { products: readonly ProductSummary[] }) {
  return (
    // The accessible name tells this list apart from the header's breadcrumbs, which are also a
    // list, both for a screen reader and for the tests.
    <ul aria-label="Productos" className={styles.grid}>
      {products.map((product) => (
        <li className={styles.cell} key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
