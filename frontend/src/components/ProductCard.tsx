import { Link, useLocation } from 'react-router';

import type { ProductSummary } from '../domain/product.ts';
import { formatPrice } from '../lib/format.ts';
import styles from './ProductCard.module.css';

/**
 * Tarjeta de producto del listado: imagen, marca, modelo y precio.
 *
 * ## Decisiones
 *
 * - **Un solo enlace envuelve toda la tarjeta.** Es un unico destino, asi que
 *   partirlo en dos enlaces (imagen y titulo) obligaria a tabular dos veces por
 *   producto para llegar al mismo sitio.
 *
 * - **La imagen se carga en diferido y declara su proporcion** en CSS. Sin
 *   reservar el espacio, cada imagen que llega desplaza la rejilla hacia abajo:
 *   es el defecto que mide la metrica de estabilidad visual (CLS).
 *
 * - **El texto alternativo es "marca + modelo", no "foto de ...".** El lector de
 *   pantalla ya anuncia que es una imagen; repetirlo es ruido.
 *
 * - **El enlace arrastra la busqueda actual** (`?q=...`). Asi el enlace de vuelta
 *   de la ficha puede devolver al usuario a su lista filtrada en lugar de al
 *   catalogo entero, y la URL del producto sigue siendo compartible.
 */
export function ProductCard({ product }: { product: ProductSummary }) {
  const { search } = useLocation();
  const name = `${product.brand} ${product.model}`.trim();

  return (
    <article className={styles.card}>
      <Link className={styles.link} to={{ pathname: `/product/${product.id}`, search }}>
        <div className={styles.media}>
          {product.imageUrl.length > 0 ? (
            <img
              alt={name}
              className={styles.image}
              // `lazy` mas `async` deja fuera del camino critico las imagenes que
              // aun no se ven y no bloquea el renderizado con su decodificacion.
              decoding="async"
              loading="lazy"
              src={product.imageUrl}
            />
          ) : (
            <span aria-hidden="true" className={styles.imageFallback}>
              Sin imagen
            </span>
          )}
        </div>

        <div className={styles.body}>
          <p className={styles.brand}>{product.brand}</p>
          <h2 className={styles.model}>{product.model}</h2>
          <p className={product.price === null ? styles.priceMissing : styles.price}>
            {formatPrice(product.price)}
          </p>
        </div>
      </Link>
    </article>
  );
}
