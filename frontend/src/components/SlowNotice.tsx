import styles from './SlowNotice.module.css';

/**
 * Long-wait notice during the first load.
 *
 * The test API is hosted on a free tier that shuts the service down when it receives no traffic:
 * measured, the first request takes about 40 seconds to start it, and the following ones answer in
 * milliseconds.
 *
 * Without this notice the application looks frozen for almost a minute. Explaining the cause costs
 * two lines and completely changes how the wait is perceived.
 */
export function SlowNotice() {
  // `aria-live` rather than `role="status"`: the same announcement behaviour, without giving an
  // informational paragraph the role of a form result.
  return (
    <p aria-live="polite" className={styles.notice}>
      Estamos despertando el servidor de la prueba, que se apaga cuando no recibe
      visitas. La primera carga puede tardar cerca de un minuto; las siguientes son
      inmediatas.
    </p>
  );
}
