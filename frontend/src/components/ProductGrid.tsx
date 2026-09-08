import type { ProductSummary } from '../domain/product.ts';
import { ProductCard } from './ProductCard.tsx';
import styles from './ProductGrid.module.css';

/**
 * Rejilla de productos.
 *
 * Es una lista (`ul`/`li`) y no un puñado de `div`: el lector de pantalla anuncia
 * "lista de 100 elementos" y permite recorrerla como tal.
 *
 * La rejilla llega hasta cuatro columnas, como pide el enunciado, y baja a tres,
 * dos y una segun el ancho disponible. Se usan puntos de ruptura explicitos en
 * lugar de `auto-fill` porque `auto-fill` no permite poner un techo al numero de
 * columnas, y en una pantalla ancha pasaria de cuatro.
 *
 * No se virtualiza: son 100 productos. Virtualizar aqui añadiria una dependencia,
 * rompería la busqueda del navegador y complicaria la accesibilidad para resolver
 * un problema que a esta escala no existe.
 */
export function ProductGrid({ products }: { products: readonly ProductSummary[] }) {
  return (
    // El nombre accesible distingue esta lista de las migas de pan de la
    // cabecera, que tambien son una lista, tanto para un lector de pantalla como
    // para los tests.
    <ul aria-label="Productos" className={styles.grid}>
      {products.map((product) => (
        <li className={styles.cell} key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
