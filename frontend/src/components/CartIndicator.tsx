import { useCart } from '../cart/useCart.ts';
import styles from './CartIndicator.module.css';

/**
 * Número de artículos en la cesta, visible en la cabecera de cualquier vista.
 *
 * Dos detalles de accesibilidad:
 *
 * - El icono es decorativo (`aria-hidden`) y el significado va en el texto, de
 *   modo que un lector de pantalla anuncia "Cesta: 2 artículos" y no "imagen".
 * - Se usa `aria-live="polite"` para que el cambio del contador se anuncie al
 *   añadir un producto: sin eso, quien no ve la pantalla no recibe confirmacion
 *   de que la acción ha surtido efecto.
 */
export function CartIndicator() {
  const { count } = useCart();

  return (
    <p className={styles.cart}>
      <span aria-hidden="true" className={styles.icon}>
        {/* Bolsa de la compra, dibujada en linea para no pedir un fichero mas. */}
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
