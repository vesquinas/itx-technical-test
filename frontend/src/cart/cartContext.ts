import { createContext } from 'react';

export interface CartContextValue {
  /** Numero de articulos en la cesta, tal y como lo informa la API. */
  count: number;
  /** Fija el contador al valor devuelto por la API y lo persiste. */
  setCount: (count: number) => void;
}

/**
 * El contexto vive en su propio modulo, separado del proveedor y del hook.
 *
 * No es una manía: Vite solo puede aplicar recarga en caliente a un fichero que
 * exporta unicamente componentes. Mezclar el componente proveedor con el hook o
 * con el objeto de contexto obliga a recargar la pagina entera en cada cambio y
 * hace perder el estado de la aplicacion mientras se desarrolla.
 */
export const CartContext = createContext<CartContextValue | undefined>(undefined);
