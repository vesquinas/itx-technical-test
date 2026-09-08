import { useState } from 'react';

import { ApiError } from '../api/client.ts';
import { addToCart } from '../api/products.ts';
import { useCart } from '../cart/useCart.ts';
import type { ProductDetail } from '../domain/product.ts';
import { OptionPicker } from './OptionPicker.tsx';
import styles from './ProductActions.module.css';

type SubmitState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'added' }
  | { status: 'failed'; message: string };

/**
 * Si hay una sola opcion se deja preseleccionada, como pide el enunciado.
 *
 * Con varias no se preselecciona ninguna: el color y la capacidad cambian el
 * producto que se compra, y elegirlos por el usuario invita a anadir a la cesta
 * algo distinto de lo que queria. El boton permanece deshabilitado hasta que ha
 * elegido las dos cosas, y se le explica por que.
 */
function defaultCode(options: readonly { code: number }[]): number | undefined {
  return options.length === 1 ? options[0]?.code : undefined;
}

/**
 * Acciones de la ficha: seleccion de capacidad y color, y anadir a la cesta.
 *
 * ## El contador de la cesta
 *
 * `POST /api/cart` responde con el numero de articulos en la cesta y el
 * enunciado pide mostrar **ese** valor en la cabecera, persistido. Es lo que
 * hace este componente: la API es la fuente de la verdad y no se lleva una
 * cuenta propia en el cliente.
 *
 * Conviene saber que la API de la prueba es un simulador y responde siempre
 * `{"count": 1}`, tambien al anadir el segundo o el tercer producto. Por eso el
 * contador de la cabecera se queda en 1 al usar la aplicacion: no es un fallo de
 * la implementacion, es el comportamiento del servicio. Queda documentado en el
 * README.
 */
export function ProductActions({ product }: { product: ProductDetail }) {
  const { setCount } = useCart();
  const { colors, storages } = product.options;

  const [colorCode, setColorCode] = useState<number | undefined>(() => defaultCode(colors));
  const [storageCode, setStorageCode] = useState<number | undefined>(() =>
    defaultCode(storages),
  );
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' });

  const hasOptions = colors.length > 0 && storages.length > 0;
  const isComplete = colorCode !== undefined && storageCode !== undefined;

  const handleAdd = async () => {
    if (colorCode === undefined || storageCode === undefined) return;

    setSubmit({ status: 'sending' });
    try {
      const count = await addToCart({ id: product.id, colorCode, storageCode });
      setCount(count);
      setSubmit({ status: 'added' });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : 'No se ha podido anadir el producto a la cesta';
      setSubmit({ status: 'failed', message });
    }
  };

  if (!hasOptions) {
    return (
      <div className={styles.actions}>
        <p className={styles.unavailable}>
          Este producto no tiene opciones de compra disponibles.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.actions}>
      <OptionPicker
        legend="Almacenamiento"
        onSelect={(code) => {
          setStorageCode(code);
          // Cualquier cambio de seleccion invalida el mensaje anterior: seguir
          // mostrando "anadido" tras cambiar el color seria enganoso.
          setSubmit({ status: 'idle' });
        }}
        options={storages}
        selectedCode={storageCode}
      />

      <OptionPicker
        legend="Color"
        onSelect={(code) => {
          setColorCode(code);
          setSubmit({ status: 'idle' });
        }}
        options={colors}
        selectedCode={colorCode}
      />

      <div className={styles.submit}>
        <button
          className={styles.button}
          disabled={!isComplete || submit.status === 'sending'}
          onClick={() => {
            void handleAdd();
          }}
          type="button"
        >
          {submit.status === 'sending' ? 'Anadiendo…' : 'Anadir a la cesta'}
        </button>

        {/*
          Region viva unica para todos los mensajes de la accion. Al ser siempre
          el mismo nodo, el lector de pantalla anuncia cada cambio; con nodos
          distintos que aparecen y desaparecen el anuncio se pierde.
        */}
        <p aria-live="polite" className={styles.feedback}>
          {!isComplete ? (
            <span className={styles.hint}>Elige almacenamiento y color para continuar.</span>
          ) : null}
          {submit.status === 'added' ? (
            <span className={styles.added}>Producto anadido a la cesta.</span>
          ) : null}
          {submit.status === 'failed' ? (
            <span className={styles.failed}>{submit.message}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
