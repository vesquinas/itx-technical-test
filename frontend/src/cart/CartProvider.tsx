import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';

import type { CartContextValue } from './cartContext.ts';
import { CartContext } from './cartContext.ts';
import { readCartCount, writeCartCount } from './cartStorage.ts';

/**
 * Cart state.
 *
 * The API is the source of truth: `POST /api/cart` answers with the number of items and that is
 * the value shown and persisted. No separate count is kept on the client, because then there would
 * be two truths that could disagree.
 *
 * The initial state is read from `localStorage` lazily, by passing the function to `useState`, so
 * storage is not touched on every render.
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
