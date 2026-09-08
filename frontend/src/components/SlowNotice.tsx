import styles from './SlowNotice.module.css';

/**
 * Aviso de espera larga durante la primera carga.
 *
 * La API de la prueba esta alojada en un plan gratuito que apaga el servicio
 * cuando no recibe trafico: medido, la primera peticion tarda unos 40 segundos
 * en arrancarlo, y las siguientes responden en milisegundos.
 *
 * Sin este aviso la aplicacion parece colgada durante casi un minuto. Explicar
 * la causa cuesta dos lineas y cambia por completo la percepcion de la espera.
 */
export function SlowNotice() {
  // `aria-live` en lugar de `role="status"`: el mismo comportamiento de anuncio,
  // sin darle a un parrafo informativo el rol de resultado de un formulario.
  return (
    <p aria-live="polite" className={styles.notice}>
      Estamos despertando el servidor de la prueba, que se apaga cuando no recibe
      visitas. La primera carga puede tardar cerca de un minuto; las siguientes son
      inmediatas.
    </p>
  );
}
