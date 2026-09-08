import { Link } from 'react-router';

import styles from './Breadcrumbs.module.css';

export interface Crumb {
  label: string;
  /** Sin `to`, la miga es la pagina actual y no se enlaza. */
  to?: string;
}

/**
 * Ruta de migas de pan.
 *
 * Se marca con `<nav aria-label>` y una lista ordenada, que es el patron que
 * esperan los lectores de pantalla: sin el, se anuncia como un puñado de enlaces
 * sueltos sin relacion jerarquica.
 *
 * La ultima miga es la pagina actual: no se enlaza y lleva `aria-current="page"`.
 */
export function Breadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  return (
    <nav aria-label="Ruta de navegacion" className={styles.nav}>
      <ol className={styles.list}>
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={crumb.label} className={styles.item}>
              {crumb.to === undefined || isLast ? (
                <span aria-current={isLast ? 'page' : undefined} className={styles.current}>
                  {crumb.label}
                </span>
              ) : (
                <Link className={styles.link} to={crumb.to}>
                  {crumb.label}
                </Link>
              )}
              {isLast ? null : (
                // El separador es decorativo: se oculta al lector de pantalla
                // para que no lea "barra" entre cada nivel.
                <span aria-hidden="true" className={styles.separator}>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
