import styles from './ProductGridSkeleton.module.css';

/** Numero de huecos que se dibujan: llena una pantalla de escritorio. */
const PLACEHOLDER_COUNT = 8;

const PLACEHOLDERS = Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => index);

/**
 * Esqueleto de la rejilla mientras carga el catalogo.
 *
 * Reproduce la forma y el numero de columnas de la rejilla real, de modo que al
 * llegar los datos el contenido no se desplaza. Un indicador giratorio centrado
 * seria mas sencillo, pero provoca justo el salto que se quiere evitar.
 *
 * Todo el bloque va con `aria-hidden` y el estado de carga se anuncia una sola
 * vez desde la vista: para un lector de pantalla, ocho tarjetas vacias no
 * aportan nada y son ocho anuncios de ruido.
 */
export function ProductGridSkeleton() {
  return (
    <ul aria-hidden="true" className={styles.grid}>
      {PLACEHOLDERS.map((index) => (
        <li className={styles.cell} key={index}>
          <div className={styles.media} />
          <div className={styles.lineShort} />
          <div className={styles.lineLong} />
          <div className={styles.lineShort} />
        </li>
      ))}
    </ul>
  );
}
