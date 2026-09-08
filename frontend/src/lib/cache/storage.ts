/**
 * Superficie mínima de almacenamiento que necesita la caché.
 *
 * Definirla como interfaz en lugar de usar `localStorage` directamente permite
 * dos cosas: probar la caché sin navegador, y degradar a memoria cuando el
 * almacenamiento persistente no está disponible.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Claves presentes, necesarias para poder limpiar por prefijo. */
  keys(): string[];
}

export function createMemoryStorage(): KeyValueStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    keys: () => [...entries.keys()],
  };
}

function wrapWebStorage(storage: Storage): KeyValueStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      storage.setItem(key, value);
    },
    removeItem: (key) => {
      storage.removeItem(key);
    },
    keys: () => {
      const result: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key !== null) result.push(key);
      }
      return result;
    },
  };
}

const PROBE_KEY = '__itx_storage_probe__';

/**
 * Comprueba que el almacenamiento se puede leer y escribir de verdad.
 *
 * No basta con que `localStorage` exista: en navegación privada de Safari y con
 * las cookies de terceros bloqueadas, el objeto está presente pero `setItem`
 * lanza una excepción. Incluso el simple acceso a la propiedad puede lanzar
 * dentro de un iframe restringido, de ahi que el acceso vaya en `try`.
 */
export function isUsable(storage: KeyValueStorage): boolean {
  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Devuelve `localStorage` si es utilizable y, si no, un almacén en memoria.
 *
 * La caché es una optimización: cuando no se puede persistir, la aplicación
 * tiene que seguir funcionando aunque pierda el cacheo entre recargas.
 */
export function resolveStorage(): KeyValueStorage {
  try {
    const candidate = wrapWebStorage(globalThis.localStorage);
    if (isUsable(candidate)) return candidate;
  } catch {
    // Sin acceso a localStorage: caemos a memoria.
  }
  return createMemoryStorage();
}
