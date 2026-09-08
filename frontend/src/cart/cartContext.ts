import { createContext } from 'react';

export interface CartContextValue {
  /** Number of items in the cart, as reported by the API. */
  count: number;
  /** Sets the counter to the value returned by the API and persists it. */
  setCount: (count: number) => void;
}

/**
 * The context lives in its own module, separate from the provider and from the hook.
 *
 * This is not fussiness: Vite can only hot-reload a file that exports components exclusively.
 * Mixing the provider component with the hook or with the context object forces a full page reload
 * on every change and loses the application state while developing.
 */
export const CartContext = createContext<CartContextValue | undefined>(undefined);
