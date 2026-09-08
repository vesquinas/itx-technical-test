import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';

import type { CartContextValue } from './cartContext.ts';
import { CartContext } from './cartContext.ts';
import { readCartCount, writeCartCount } from './cartStorage.ts';

/**
 * Estado de la cesta.
 *
 * La API es la fuente de la verdad: `POST /api/cart` responde con el número de
 * artículos y ese es el valor que se muestra y se persiste. No se lleva una
 * cuenta propia en el cliente, porque entonces habría dos verdades que podrian
 * discrepar.
 *
 * El estado inicial se lee de `localStorage` de forma perezosa, pasando la
 * función a `useState`, para no tocar el almacenamiento en cada renderizado.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [count, setCountState] = useState<number>(readCartCount);

  const setCount = useCallback((next: number) => {
    setCountState(next);
    writeCartCount(next);
  }, []);

  const value = useMemo<CartContextValue>(() => ({ count, setCount }), [count, setCount]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
