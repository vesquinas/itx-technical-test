import { useEffect, useState } from 'react';

/**
 * Devuelve el valor con retardo, actualizandolo solo cuando deja de cambiar.
 *
 * En esta aplicacion NO se usa para retrasar el filtrado: los productos ya estan
 * en memoria y filtrarlos es instantaneo, asi que retrasarlo solo empeoraria la
 * experiencia. Se usa para sincronizar el termino de busqueda con la URL, que si
 * conviene no reescribir en cada pulsacion de tecla.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
