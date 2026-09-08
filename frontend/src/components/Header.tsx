import { Link } from 'react-router';

import type { Crumb } from './Breadcrumbs.tsx';
import { Breadcrumbs } from './Breadcrumbs.tsx';
import { CartIndicator } from './CartIndicator.tsx';
import styles from './Header.module.css';

/**
 * The application header, present on both views.
 *
 * It receives the breadcrumb trail as a prop instead of deriving it from the route. The reason is
 * that the detail view's crumb is the product name, which is only known once the product has
 * loaded: passing it from the view keeps the header a stateless component, easy to test and with
 * no need for a context or effects to keep the title in sync.
 */
export function Header({ trail }: { trail: readonly Crumb[] }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* The title links to the main view, as the brief asks. */}
        <Link aria-label="Ir a la lista de productos" className={styles.brand} to="/">
          <span className={styles.brandMark}>MOBILE</span>
          <span className={styles.brandThin}>STORE</span>
        </Link>

        <Breadcrumbs trail={trail} />

        <CartIndicator />
      </div>
    </header>
  );
}
