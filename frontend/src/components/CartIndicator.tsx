import { useCart } from '../cart/useCart.ts';
import styles from './CartIndicator.module.css';

/**
 * Number of items in the cart, visible in the header of every view.
 *
 * Two accessibility details:
 *
 * - The icon is decorative (`aria-hidden`) and the meaning lives in the text, so a screen reader
 *   announces "Cesta: 2 artículos" and not "image".
 * - `aria-live="polite"` makes the change of the counter announced when a product is added:
 *   without it, someone who cannot see the screen gets no confirmation the action took effect.
 */
export function CartIndicator() {
  const { count } = useCart();

  return (
    <p className={styles.cart}>
      <span aria-hidden="true" className={styles.icon}>
        {/* Shopping bag, drawn inline so as not to request one more file. */}
        <svg fill="none" height="18" viewBox="0 0 18 18" width="18">
          <path
            d="M3.5 5.5h11l-.9 10.2a1 1 0 0 1-1 .8H5.4a1 1 0 0 1-1-.8L3.5 5.5Z"
            stroke="currentColor"
            strokeWidth="1.1"
          />
          <path
            d="M6.4 5.5V4.2a2.6 2.6 0 0 1 5.2 0v1.3"
            stroke="currentColor"
            strokeWidth="1.1"
          />
        </svg>
      </span>
      <span className={styles.label}>Cesta</span>
      <span aria-live="polite" className={styles.count}>
        <span className="visually-hidden">
          {count === 1 ? '1 artículo' : `${String(count)} artículos`}
        </span>
        <span aria-hidden="true">{count}</span>
      </span>
    </p>
  );
}
