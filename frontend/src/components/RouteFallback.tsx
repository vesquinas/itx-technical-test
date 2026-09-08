import styles from './RouteFallback.module.css';

/**
 * Relleno mientras se descarga el fragmento de una vista.
 *
 * Es deliberadamente sobrio: en una conexion normal esta en pantalla unas pocas
 * decenas de milisegundos, y un esqueleto elaborado provocaria un parpadeo mas
 * molesto que la propia espera. Los esqueletos detallados se reservan para la
 * carga de datos, que es la espera larga de verdad.
 */
export function RouteFallback() {
  return (
    <div className={styles.fallback}>
      <p aria-live="polite" className="visually-hidden">
        Cargando la pagina
      </p>
    </div>
  );
}
