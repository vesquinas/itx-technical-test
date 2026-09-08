import type { KeyValueStorage } from '../lib/cache/index.ts';
import { resolveStorage } from '../lib/cache/index.ts';
import { asPositiveInteger } from '../lib/parse.ts';

const STORAGE_KEY = 'itx-cart-count';

/**
 * El almacen se resuelve una sola vez y se recuerda.
 *
 * `resolveStorage` comprueba que se puede escribir de verdad, y para eso escribe y borra una
 * clave de sondeo. Llamarlo en cada lectura y en cada escritura del contador convertia dos
 * operaciones en seis, y dejaba una escritura de sondeo por cada vez que se pinta la cabecera.
 * Se resuelve de forma perezosa, en el primer uso, para no tocar el almacenamiento al importar
 * el modulo.
 */
let resolved: KeyValueStorage | undefined;

function storage(): KeyValueStorage {
  resolved ??= resolveStorage();
  return resolved;
}

/**
 * Persistencia del contador de la cesta.
 *
 * El enunciado pide que el numero de articulos se muestre en la cabecera en
 * cualquier vista y que el dato se persista. Se guarda aparte de la cache de
 * productos porque no caduca: no es informacion cacheada de la API, es el estado
 * de la sesion del usuario.
 *
 * Se valida al leer por el mismo motivo que en la cache: el contenido de
 * `localStorage` es editable por el usuario y `"abc"` o `-5` no son contadores
 * validos.
 */
export function readCartCount(): number {
  const raw = storage().getItem(STORAGE_KEY);
  if (raw === null) return 0;

  const parsed = Number(raw);
  return asPositiveInteger(parsed) ?? 0;
}

export function writeCartCount(count: number): void {
  storage().setItem(STORAGE_KEY, String(count));
}
