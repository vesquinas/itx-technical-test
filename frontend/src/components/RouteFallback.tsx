import styles from './RouteFallback.module.css';

/**
 * Filler shown while a view's chunk is downloading.
 *
 * It is deliberately plain: on a normal connection it is on screen for a few tens of
 * milliseconds, and an elaborate skeleton would cause a flicker more annoying than the wait
 * itself. Detailed skeletons are reserved for the data loading, which is the genuinely long wait.
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
