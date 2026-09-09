import { useId } from 'react';

import type { ProductDetail } from '../domain/product.ts';
import { formatPrice, formatWeight, joinSpecs } from '../lib/format.ts';
import styles from './ProductSpecs.module.css';

interface Row {
  label: string;
  value: string;
  /**
   * Required rows are always shown, even with no value.
   *
   * The brief asks to display "at least" eleven specific attributes, so hiding one because the API
   * does not provide it breaks the requirement. And it is not a rare case: across the 100 products
   * of the catalogue, 1 in 5 has at least one of those eleven empty (weight is missing in 7
   * products, RAM in 4, the front camera in 4). When there is no data we say so explicitly, which
   * also informs more than making the row disappear.
   */
  required: boolean;
}

/** Copy for a required attribute the API gives no value for. */
const NOT_AVAILABLE = 'No disponible';

/** An attribute the brief requires: always shown, with a value or without one. */
function required(label: string, value: string): Row {
  return { label, value: value.length > 0 ? value : NOT_AVAILABLE, required: true };
}

/** Additional attributes: the ones the API leaves empty are dropped. */
function optional(entries: readonly (readonly [string, string])[]): Row[] {
  return entries
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => ({ label, value, required: false }));
}

/**
 * Builds the rows of the spec sheet.
 *
 * The first eleven are the ones the brief requires. The rest extend the sheet with everything else
 * the API offers, and those are dropped when empty: `nfc`, for instance, arrives empty in 94 of the
 * 100 products, and a label with nothing next to it informs no one.
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
 * The product's spec sheet.
 *
 * It is a definition list (`dl`/`dt`/`dd`), which is the element that matches a set of
 * label-value pairs. A table would imply two dimensions that do not exist here, and a list of
 * paragraphs would lose the relationship between each label and its value for a screen reader.
 */
export function ProductSpecs({ product }: { product: ProductDetail }) {
  // `useId` rather than a fixed identifier: two spec sheets on the same page would produce
  // duplicate identifiers, which is an accessibility error and makes `aria-labelledby` point at
  // the wrong element.
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
