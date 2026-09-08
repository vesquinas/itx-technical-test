import { useEffect, useState } from 'react';

/**
 * Devuelve el valor con retardo, actualizandolo solo cuando deja de cambiar.
 *
 * En esta aplicación NO se usa para retrasar el filtrado: los productos ya están
 * en memoria y filtrarlos es instantaneo, así que retrasarlo solo empeoraría la
 * experiencia. Se usa para sincronizar el termino de búsqueda con la URL, que si
 * conviene no reescribir en cada pulsación de tecla.
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
