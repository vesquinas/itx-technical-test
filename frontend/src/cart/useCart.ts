import { useContext } from 'react';

import type { CartContextValue } from './cartContext.ts';
import { CartContext } from './cartContext.ts';

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  // Fail explicitly rather than returning a silent zero: a component outside the provider is a
  // programming error, not a case to tolerate at runtime.
  if (context === undefined) {
    throw new Error('useCart has to be used inside a CartProvider');
  }
  return context;
}
