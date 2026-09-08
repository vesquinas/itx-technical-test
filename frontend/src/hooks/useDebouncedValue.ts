import { useEffect, useState } from 'react';

/**
 * Returns the value with a delay, updating it only once it stops changing.
 *
 * In this application it is NOT used to delay the filtering: the products are already in memory
 * and filtering them is instantaneous, so delaying it would only make the experience worse. It is
 * used to sync the search term with the URL, which is what is better not rewritten on every
 * keystroke.
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
