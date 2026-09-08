import { Link } from 'react-router';

import type { Crumb } from './Breadcrumbs.tsx';
import { Breadcrumbs } from './Breadcrumbs.tsx';
import { CartIndicator } from './CartIndicator.tsx';
import styles from './Header.module.css';

/**
 * Cabecera de la aplicación, presente en las dos vistas.
 *
 * Recibe las migas de pan como prop en lugar de deducirlas de la ruta. El motivo
 * es que la miga de la vista de detalle es el nombre del producto, que solo se
 * conoce cuando el producto ha cargado: pasarla desde la vista mantiene la
 * cabecera como un componente sin estado, facil de probar y sin necesidad de un
 * contexto ni de efectos para sincronizar el titulo.
 */
export function Header({ trail }: { trail: readonly Crumb[] }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* El titulo enlaza a la vista principal, como pide el enunciado. */}
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
