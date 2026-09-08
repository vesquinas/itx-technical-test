import styles from './RouteFallback.module.css';

/**
 * Relleno mientras se descarga el fragmento de una vista.
 *
 * Es deliberadamente sobrio: en una conexión normal está en pantalla unas pocas
 * decenas de milisegundos, y un esqueleto elaborado provocaría un parpadeo más
 * molesto que la propia espera. Los esqueletos detallados se reservan para la
 * carga de datos, que es la espera larga de verdad.
 */
export function RouteFallback() {
  return (
    <div className={styles.fallback}>
      <p aria-live="polite" className="visually-hidden">
        Cargando la página
      </p>
    </div>
  );
}
