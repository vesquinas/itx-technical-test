import { useContext } from 'react';

import type { CartContextValue } from './cartContext.ts';
import { CartContext } from './cartContext.ts';

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  // Falla de forma explicita en lugar de devolver un cero silencioso: un
  // componente fuera del proveedor es un error de programacion, no un caso que
  // haya que tolerar en ejecucion.
  if (context === undefined) {
    throw new Error('useCart tiene que usarse dentro de un CartProvider');
  }
  return context;
}
