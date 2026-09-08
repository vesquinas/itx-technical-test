import type { ReactNode } from 'react';

import type { Crumb } from './Breadcrumbs.tsx';
import { Header } from './Header.tsx';
import styles from './PageLayout.module.css';

/**
 * Estructura comun a las dos vistas: cabecera fija y contenido principal.
 *
 * El enlace "Saltar al contenido" es el primer elemento enfocable del documento.
 * Quien navega con teclado puede asi evitar la cabecera en cada pagina, en lugar
 * de recorrerla entera con el tabulador cada vez.
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
