import { useId } from 'react';

import type { ProductDetail } from '../domain/product.ts';
import { formatPrice, formatWeight, joinSpecs } from '../lib/format.ts';
import styles from './ProductSpecs.module.css';

interface Row {
  label: string;
  value: string;
  /**
   * Las filas obligatorias se muestran siempre, incluso sin valor.
   *
   * El enunciado pide mostrar «al menos» once atributos concretos, así que
   * ocultar uno porque la API no lo trae incumple el requisito. Y no es un caso
   * raro: sobre los 100 productos del catálogo, 1 de cada 5 tiene al menos uno
   * de esos once vacío (el peso falta en 7 productos, la RAM en 4, la cámara
   * frontal en 4). Cuando no hay dato se dice explícitamente, que además informa
   * más que hacer desaparecer la fila.
   */
  required: boolean;
}

/** Texto para un atributo obligatorio del que la API no da valor. */
const NOT_AVAILABLE = 'No disponible';

/** Atributo exigido por el enunciado: se muestra siempre, con valor o sin él. */
function required(label: string, value: string): Row {
  return { label, value: value.length > 0 ? value : NOT_AVAILABLE, required: true };
}

/** Atributos adicionales: se omiten los que la API deja vacíos. */
function optional(entries: readonly (readonly [string, string])[]): Row[] {
  return entries
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => ({ label, value, required: false }));
}

/**
 * Construye las filas de la ficha técnica.
 *
 * Las once primeras son las que exige el enunciado. El resto amplía la ficha con
 * lo demás que ofrece la API, y esas sí se omiten cuando vienen vacías: `nfc`,
 * por ejemplo, llega vacío en los 100 productos del catálogo, y una etiqueta sin
 * valor al lado no informa de nada.
 */
function buildRows(product: ProductDetail): Row[] {
  const { specs } = product;

  return [
    required('Marca', product.brand),
    required('Modelo', product.model),
    required('Precio', formatPrice(product.price)),
    required('Procesador', joinSpecs(specs.cpu)),
    required('Memoria RAM', specs.ram),
    required('Sistema operativo', joinSpecs(specs.operatingSystem)),
    required('Resolución de pantalla', specs.screenResolution),
    required('Batería', specs.battery),
    required('Cámara principal', joinSpecs(specs.primaryCamera)),
    required('Cámara frontal', joinSpecs(specs.secondaryCamera)),
    required('Dimensiones', specs.dimensions),
    required('Peso', formatWeight(specs.weight)),

    ...optional([
      ['Tamaño de pantalla', specs.screenSize],
      ['Tipo de pantalla', specs.screenType],
      ['Chipset', specs.chipset],
      ['GPU', specs.gpu],
      ['Almacenamiento interno', joinSpecs(specs.internalMemory)],
      ['Almacenamiento externo', specs.externalMemory],
      ['SIM', joinSpecs(specs.sim)],
      ['Tecnología de red', specs.networkTechnology],
      ['Velocidad de red', specs.networkSpeed],
      ['Bluetooth', joinSpecs(specs.bluetooth)],
      ['Wi-Fi', joinSpecs(specs.wlan)],
      ['GPS', specs.gps],
      ['NFC', specs.nfc],
      ['USB', specs.usb],
      ['Jack de audio', specs.audioJack],
      ['Altavoz', specs.speaker],
      ['Radio', joinSpecs(specs.radio)],
      ['Sensores', joinSpecs(specs.sensors)],
      ['Anuncio', specs.announced],
      ['Estado', specs.status],
    ]),
  ];
}


/**
 * Ficha tecnica del producto.
 *
 * Es una lista de definiciones (`dl`/`dt`/`dd`), que es el elemento que
 * corresponde a un conjunto de pares etiqueta-valor. Una tabla implicaria dos
 * dimensiones que aquí no existen, y una lista de parrafos perderia la relación
 * entre cada etiqueta y su valor para un lector de pantalla.
 */
export function ProductSpecs({ product }: { product: ProductDetail }) {
  // `useId` en lugar de un identificador fijo: dos fichas en la misma página producirian
  // identificadores duplicados, que es un error de accesibilidad y hace que `aria-labelledby`
  // apunte al elemento equivocado.
  const headingId = useId();
  const rows = buildRows(product);

  return (
    <section aria-labelledby={headingId}>
      <h2 className={styles.heading} id={headingId}>
        Características
      </h2>
      <dl className={styles.list}>
        {rows.map((row) => (
          <div className={styles.row} key={row.label}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={row.value === NOT_AVAILABLE ? styles.missing : styles.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
