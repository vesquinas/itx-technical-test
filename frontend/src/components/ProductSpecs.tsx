import type { ProductDetail } from '../domain/product.ts';
import { formatPrice, formatWeight, joinSpecs } from '../lib/format.ts';
import styles from './ProductSpecs.module.css';

interface Row {
  label: string;
  value: string;
}

/**
 * Construye las filas de la ficha tecnica.
 *
 * Las primeras once son las que exige el enunciado; el resto amplia la ficha con
 * lo demas que ofrece la API. Se descartan las filas sin valor: la API deja
 * bastantes campos vacios (`nfc` viene vacio en todos los productos muestreados)
 * y una etiqueta con un guion al lado no informa de nada.
 */
function buildRows(product: ProductDetail): Row[] {
  const { specs } = product;

  const rows: Row[] = [
    { label: 'Marca', value: product.brand },
    { label: 'Modelo', value: product.model },
    { label: 'Precio', value: formatPrice(product.price) },
    { label: 'Procesador', value: joinSpecs(specs.cpu) },
    { label: 'Memoria RAM', value: specs.ram },
    { label: 'Sistema operativo', value: joinSpecs(specs.operatingSystem) },
    { label: 'Resolucion de pantalla', value: specs.screenResolution },
    { label: 'Bateria', value: specs.battery },
    { label: 'Camara principal', value: joinSpecs(specs.primaryCamera) },
    { label: 'Camara frontal', value: joinSpecs(specs.secondaryCamera) },
    { label: 'Dimensiones', value: specs.dimensions },
    { label: 'Peso', value: formatWeight(specs.weight) },

    { label: 'Tamano de pantalla', value: specs.screenSize },
    { label: 'Tipo de pantalla', value: specs.screenType },
    { label: 'Chipset', value: specs.chipset },
    { label: 'GPU', value: specs.gpu },
    { label: 'Almacenamiento interno', value: joinSpecs(specs.internalMemory) },
    { label: 'Almacenamiento externo', value: specs.externalMemory },
    { label: 'SIM', value: joinSpecs(specs.sim) },
    { label: 'Tecnologia de red', value: specs.networkTechnology },
    { label: 'Velocidad de red', value: specs.networkSpeed },
    { label: 'Bluetooth', value: joinSpecs(specs.bluetooth) },
    { label: 'Wi-Fi', value: joinSpecs(specs.wlan) },
    { label: 'GPS', value: specs.gps },
    { label: 'NFC', value: specs.nfc },
    { label: 'USB', value: specs.usb },
    { label: 'Jack de audio', value: specs.audioJack },
    { label: 'Altavoz', value: specs.speaker },
    { label: 'Radio', value: joinSpecs(specs.radio) },
    { label: 'Sensores', value: joinSpecs(specs.sensors) },
    { label: 'Anuncio', value: specs.announced },
    { label: 'Estado', value: specs.status },
  ];

  return rows.filter((row) => row.value.length > 0);
}

/**
 * Ficha tecnica del producto.
 *
 * Es una lista de definiciones (`dl`/`dt`/`dd`), que es el elemento que
 * corresponde a un conjunto de pares etiqueta-valor. Una tabla implicaria dos
 * dimensiones que aqui no existen, y una lista de parrafos perderia la relacion
 * entre cada etiqueta y su valor para un lector de pantalla.
 */
export function ProductSpecs({ product }: { product: ProductDetail }) {
  const rows = buildRows(product);

  return (
    <section aria-labelledby="ficha-tecnica">
      <h2 className={styles.heading} id="ficha-tecnica">
        Caracteristicas
      </h2>
      <dl className={styles.list}>
        {rows.map((row) => (
          <div className={styles.row} key={row.label}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={styles.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
