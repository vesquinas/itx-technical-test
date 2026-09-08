import { Link } from 'react-router';

import type { Crumb } from '../components/Breadcrumbs.tsx';
import { PageLayout } from '../components/PageLayout.tsx';
import styles from './NotFoundPage.module.css';

const TRAIL: Crumb[] = [{ label: 'Página no encontrada' }];

/**
 * Catch-all route.
 *
 * Without it, a mistyped URL leaves the application blank with no explanation whatsoever: the
 * router finds no match and renders nothing.
 */
export function NotFoundPage() {
  return (
    <PageLayout trail={TRAIL}>
      <div className={styles.block}>
        <h1 className={styles.title}>Página no encontrada</h1>
        <p className={styles.text}>La dirección a la que has llegado no existe.</p>
        <Link className={styles.action} to="/">
          Ir al listado de productos
        </Link>
      </div>
    </PageLayout>
  );
}
