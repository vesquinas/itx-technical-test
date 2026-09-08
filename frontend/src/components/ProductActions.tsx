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
 * If there is a single option it is left preselected, as the brief asks.
 *
 * With several, none is preselected: colour and capacity change which product is being bought, and
 * choosing them on the user's behalf invites adding something other than what they wanted to the
 * cart. The button stays disabled until they have chosen both, and they are told why.
 */
function defaultCode(options: readonly { code: number }[]): number | undefined {
  return options.length === 1 ? options[0]?.code : undefined;
}

/**
 * The detail page's actions: capacity and colour selection, and add to cart.
 *
 * ## The cart counter
 *
 * `POST /api/cart` answers with the number of items in the cart, and the brief asks to show
 * **that** value in the header, persisted. That is what this component does: the API is the source
 * of truth and no separate count is kept on the client.
 *
 * The API keeps the basket in a server-side session identified by an `HttpOnly` cookie, so the
 * counter only climbs when the browser can send that cookie back — which means same-origin
 * requests. Development goes through the development server's proxy and works; the statically
 * hosted demo cannot proxy anything and stays at 1. The full diagnosis is in the README.
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
          : 'No se ha podido añadir el producto a la cesta';
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
        // The pickers are locked while sending. Without this, changing colour with the request in
        // flight left a misleading message: when the response arrived it announced "product added"
        // for a selection other than the one that had been sent.
        disabled={submit.status === 'sending'}
        legend="Almacenamiento"
        onSelect={(code) => {
          setStorageCode(code);
          // Any change of selection invalidates the previous message: keeping "added" on screen
          // after changing the colour would be misleading.
          setSubmit({ status: 'idle' });
        }}
        options={storages}
        selectedCode={storageCode}
      />

      <OptionPicker
        disabled={submit.status === 'sending'}
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
          {submit.status === 'sending' ? 'Añadiendo…' : 'Añadir a la cesta'}
        </button>

        {/*
          One single live region for every message of this action. Because it is always the same
          node, the screen reader announces each change; with separate nodes appearing and
          disappearing, the announcement gets lost.
        */}
        <p aria-live="polite" className={styles.feedback}>
          {!isComplete ? (
            <span className={styles.hint}>Elige almacenamiento y color para continuar.</span>
          ) : null}
          {submit.status === 'added' ? (
            <span className={styles.added}>Producto añadido a la cesta.</span>
          ) : null}
          {submit.status === 'failed' ? (
            <span className={styles.failed}>{submit.message}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
