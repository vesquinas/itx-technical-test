import { Link } from 'react-router';

import type { Crumb } from '../components/Breadcrumbs.tsx';
import { PageLayout } from '../components/PageLayout.tsx';
import styles from './NotFoundPage.module.css';

const TRAIL: Crumb[] = [{ label: 'Pagina no encontrada' }];

/**
 * Ruta comodin.
 *
 * Sin esta ruta, una URL mal escrita deja la aplicacion en blanco sin ninguna
 * explicacion: el enrutador no encuentra coincidencia y no pinta nada.
 */
export function NotFoundPage() {
  return (
    <PageLayout trail={TRAIL}>
      <div className={styles.block}>
        <h1 className={styles.title}>Pagina no encontrada</h1>
        <p className={styles.text}>La direccion a la que has llegado no existe.</p>
        <Link className={styles.action} to="/">
          Ir al listado de productos
        </Link>
      </div>
    </PageLayout>
  );
}
