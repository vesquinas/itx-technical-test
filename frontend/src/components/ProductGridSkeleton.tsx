import styles from './ProductGridSkeleton.module.css';

/** Number of placeholders drawn: enough to fill a desktop screen. */
const PLACEHOLDER_COUNT = 8;

const PLACEHOLDERS = Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => index);

/**
 * Skeleton of the grid while the catalogue loads.
 *
 * It mirrors the shape and column count of the real grid, so that when the data arrives the
 * content does not shift. A centred spinner would be simpler, but it causes exactly the jump we
 * are trying to avoid.
 *
 * The whole block is `aria-hidden` and the loading state is announced once from the view: to a
 * screen reader, eight empty cards contribute nothing and are eight announcements of noise.
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
