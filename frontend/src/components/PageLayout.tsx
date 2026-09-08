import type { ReactNode } from 'react';

import type { Crumb } from './Breadcrumbs.tsx';
import { Header } from './Header.tsx';
import styles from './PageLayout.module.css';

/**
 * The structure shared by both views: a sticky header and the main content.
 *
 * The "skip to content" link is the first focusable element of the document. Anyone navigating
 * with a keyboard can therefore skip the header on every page instead of tabbing all the way
 * through it every time.
 */
export function PageLayout({
  trail,
  children,
}: {
  trail: readonly Crumb[];
  children: ReactNode;
}) {
  return (
    <>
      <a className={styles.skipLink} href="#contenido">
        Saltar al contenido
      </a>
      <Header trail={trail} />
      <main className={styles.main} id="contenido">
        {children}
      </main>
    </>
  );
}
