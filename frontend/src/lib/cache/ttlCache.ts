import type { Parser } from '../parse.ts';
import { isRecord } from '../parse.ts';
import type { KeyValueStorage } from './storage.ts';
import { resolveStorage } from './storage.ts';

/** Expiración exigida por el enunciado. */
export const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Lo que se guarda realmente en el almacén. Los nombres son cortos porque esto
 * se serializa una vez por producto y `localStorage` tiene una cuota pequeña
 * (unos 5 MB por origen).
 */
interface Envelope {
  /** Versión del formato de los datos. */
  v: number;
  /** Instante, en epoch ms, a partir del cual la entrada deja de valer. */
  e: number;
  /** Carga útil, sin validar. */
  d: unknown;
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    isRecord(value) &&
    typeof value['v'] === 'number' &&
    typeof value['e'] === 'number' &&
    'd' in value
  );
}

export interface TtlCacheOptions {
  /** Prefijo de las claves, para no pisar otros datos del mismo origen. */
  namespace: string;
  /** Tiempo de vida de cada entrada. Por defecto, una hora. */
  ttlMs?: number;
  /**
   * Versión del formato. Subirla inválida de golpe todo lo cacheado, que es lo
   * que hay que hacer cuando cambia la forma de los datos: sin esto, un usuario
   * que ya tuviera la versión anterior en su navegador seguiría leyéndola.
   */
  version?: number;
  storage?: KeyValueStorage;
  /** Reloj inyectable, para poder probar la expiración sin esperar una hora. */
  now?: () => number;
}

/**
 * Caché de cliente con expiración por entrada.
 *
 * Tres decisiones que merecen explicación:
 *
 * - **Se valida al leer, no solo al escribir.** Lo que sale de `localStorage` es
 *   texto que el usuario puede haber editado, o que escribió una versión
 *   anterior de la aplicación. Tratarlo como dato de confianza es el error que
 *   convierte una caché en un fallo de seguridad, así que `get` exige un parser.
 *
 * - **Al expirar se borra y se devuelve `undefined`**, de modo que quien llama
 *   revalida contra la API. Es exactamente lo que pide el enunciado. Se valoro
 *   servir el dato caducado mientras se revalida en segundo plano
 *   (stale-while-revalidate), pero eso muestra datos vencidos y el requisito
 *   dice que la información "deberá revalidarse".
 *
 * - **Ningún fallo del almacén se propaga.** La caché es una optimización; si no
 *   puede escribir, la aplicación tiene que seguir funcionando.
 */
export class TtlCache {
  private readonly storage: KeyValueStorage;
  private readonly prefix: string;
  private readonly ttlMs: number;
  private readonly version: number;
  private readonly now: () => number;

  constructor(options: TtlCacheOptions) {
    this.storage = options.storage ?? resolveStorage();
    this.ttlMs = options.ttlMs ?? ONE_HOUR_MS;
    this.version = options.version ?? 1;
    // Closure en lugar de `Date.now` a secas: guardar la referencia directa la
    // congela en el momento de construir la caché, y entonces sustituir el reloj
    // (en un test, o con una librería de tiempo virtual) ya no tiene efecto.
    this.now = options.now ?? (() => Date.now());
    this.prefix = `${options.namespace}/v${String(this.version)}/`;
  }

  private storageKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Devuelve el valor cacheado, o `undefined` si no hay, está caducado o no
   * supera la validación. Las entradas inválidas se eliminan al leerlas para no
   * dejar basura acumulada en el navegador.
   */
  get<T>(key: string, parse: Parser<T>): T | undefined {
    const storageKey = this.storageKey(key);

    let raw: string | null;
    try {
      raw = this.storage.getItem(storageKey);
    } catch {
      return undefined;
    }
    if (raw === null) return undefined;

    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      this.delete(key);
      return undefined;
    }

    if (!isEnvelope(envelope) || envelope.v !== this.version) {
      this.delete(key);
      return undefined;
    }

    if (this.now() >= envelope.e) {
      this.delete(key);
      return undefined;
    }

    const parsed = parse(envelope.d);
    if (parsed === undefined) {
      this.delete(key);
      return undefined;
    }

    return parsed;
  }

  /** Guarda un valor con la expiración configurada contada desde ahora. */
  set(key: string, data: unknown): void {
    const envelope: Envelope = { v: this.version, e: this.now() + this.ttlMs, d: data };
    const serialized = JSON.stringify(envelope);

    try {
      this.storage.setItem(this.storageKey(key), serialized);
    } catch {
      // Lo habitual aquí es haber agotado la cuota. Liberamos lo que es nuestro
      // y probamos una sola vez más; si vuelve a fallar, seguimos sin cachear.
      this.clear();
      try {
        this.storage.setItem(this.storageKey(key), serialized);
      } catch {
        // Sin caché. La aplicación sigue: irá a la API en cada petición.
      }
    }
  }

  delete(key: string): void {
    try {
      this.storage.removeItem(this.storageKey(key));
    } catch {
      // Nada que hacer.
    }
  }

  /** Elimina únicamente las entradas de este namespace y versión. */
  clear(): void {
    try {
      for (const key of this.storage.keys()) {
        if (key.startsWith(this.prefix)) this.storage.removeItem(key);
      }
    } catch {
      // Nada que hacer.
    }
  }
}
