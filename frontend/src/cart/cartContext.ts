import { createContext } from 'react';

export interface CartContextValue {
  /** Número de artículos en la cesta, tal y como lo informa la API. */
  count: number;
  /** Fija el contador al valor devuelto por la API y lo persiste. */
  setCount: (count: number) => void;
}

/**
 * El contexto vive en su propio modulo, separado del proveedor y del hook.
 *
 * No es una manía: Vite solo puede aplicar recarga en caliente a un fichero que
 * exporta únicamente componentes. Mezclar el componente proveedor con el hook o
 * con el objeto de contexto obliga a recargar la página entera en cada cambio y
 * hace perder el estado de la aplicación mientras se desarrolla.
 */
export const CartContext = createContext<CartContextValue | undefined>(undefined);
