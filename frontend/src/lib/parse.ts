/**
 * Utilidades para estrechar `unknown` a tipos concretos.
 *
 * Se usan en dos fronteras donde entran datos que no controlamos:
 *
 *  1. Las respuestas de la API.
 *  2. Lo que se lee de `localStorage`, que el usuario puede editar a mano.
 *
 * En ambos casos TypeScript no ayuda: `strict` protege del codigo mal escrito,
 * no de un JSON con otra forma. La comprobacion tiene que ocurrir en ejecucion.
 */

/** Convierte una entrada desconocida en `T`, o devuelve `undefined` si no encaja. */
export type Parser<T> = (input: unknown) => T | undefined;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Texto saneado: recorta espacios y colapsa los blancos repetidos. */
export function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Normaliza los campos que la API devuelve unas veces como texto y otras como
 * lista de textos (`cpu`, `sim`, `primaryCamera`, `wlan`, `sensors`...).
 *
 * Sin esta normalizacion React renderiza el array concatenando sus elementos sin
 * separador ("Quad-core1.3 GHz"), que es un fallo visible en la interfaz.
 */
export function asTextList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items.map(asText).filter((item) => item.length > 0);
}

/**
 * La API entrega el precio como cadena y en 6 de los 100 productos viene vacia.
 * Devolvemos `null` en lugar de `NaN` para que la interfaz tenga que decidir
 * explicitamente que mostrar cuando no hay precio.
 */
export function asPrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function asPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

/** Aplica un parser a cada elemento y descarta los que no encajen. */
export function asArrayOf<T>(value: unknown, parse: Parser<T>): T[] {
  if (!Array.isArray(value)) return [];
  const result: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (parsed !== undefined) result.push(parsed);
  }
  return result;
}
