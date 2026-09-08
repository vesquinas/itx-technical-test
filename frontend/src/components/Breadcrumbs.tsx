import { Link } from 'react-router';

import styles from './Breadcrumbs.module.css';

export interface Crumb {
  label: string;
  /** With no `to`, the crumb is the current page and is not linked. */
  to?: string;
}

/**
 * Breadcrumb trail.
 *
 * It is marked up as a `<nav aria-label>` with an ordered list, which is the pattern screen
 * readers expect: without it, it is announced as a handful of unrelated links with no hierarchy.
 *
 * The last crumb is the current page: it is not linked and carries `aria-current="page"`.
 */
export function Breadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  return (
    <nav aria-label="Ruta de navegación" className={styles.nav}>
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
                // The separator is decorative: it is hidden from the screen reader so it does
                // not read out "slash" between every level.
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
