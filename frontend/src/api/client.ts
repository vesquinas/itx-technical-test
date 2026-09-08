/**
 * Cliente HTTP de la aplicacion.
 *
 * Responsabilidades: construir las URLs de forma segura, imponer un limite de
 * tiempo a toda peticion y traducir cualquier fallo a un error tipado que la
 * interfaz pueda explicar al usuario.
 */

import type { Parser } from '../lib/parse.ts';

const DEFAULT_BASE_URL = 'https://itx-frontend-test.onrender.com';

/**
 * La API de la prueba esta alojada en el plan gratuito de Render, que apaga el
 * servicio cuando no recibe trafico. La primera peticion tras un periodo de
 * inactividad tarda unos 40 segundos en responder porque el servicio tiene que
 * arrancar (medido). Un limite de tiempo "normal" de 10 segundos haria fallar
 * siempre la primera carga, asi que se toma un margen amplio y es la interfaz la
 * que avisa al usuario de que la espera puede ser larga.
 */
export const DEFAULT_TIMEOUT_MS = 60_000;

export type ApiFailureKind =
  /** No hubo respuesta: sin conexion, DNS, CORS o servidor caido. */
  | 'network'
  /** Se agoto el limite de tiempo. */
  | 'timeout'
  /** El recurso no existe (404). */
  | 'notFound'
  /** Respondio con un codigo de error distinto de 404. */
  | 'http'
  /** Respondio, pero el cuerpo no tiene la forma esperada. */
  | 'malformed'
  /** La peticion se cancelo desde la aplicacion (cambio de vista, por ejemplo). */
  | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiFailureKind;
  readonly status: number | undefined;

  constructor(kind: ApiFailureKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  const raw = typeof configured === 'string' && configured.length > 0 ? configured : DEFAULT_BASE_URL;
  // Normaliza para que `new URL` no descarte segmentos de la ruta base.
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/**
 * Construye la URL a partir de segmentos ya codificados.
 *
 * Se usa `encodeURIComponent` en cada segmento en lugar de interpolar en una
 * plantilla: un identificador que contenga `../` o `?` no debe poder cambiar la
 * ruta ni anadir parametros a la peticion.
 */
export function buildUrl(segments: readonly string[]): string {
  const path = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return new URL(path, resolveBaseUrl()).toString();
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

/**
 * Realiza la peticion y valida la respuesta con `parse`.
 *
 * Devolver el tipo ya validado (en vez de `unknown` o un `as`) es lo que hace
 * que el resto de la aplicacion pueda confiar en sus datos.
 */
export async function requestJson<T>(
  url: string,
  parse: Parser<T>,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal: combineSignals(signal, timeoutMs),
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    throw toRequestError(cause, signal);
  }

  if (response.status === 404) {
    throw new ApiError('notFound', `El recurso solicitado no existe (${url})`, 404);
  }

  if (!response.ok) {
    throw new ApiError(
      'http',
      `La API respondio con el codigo ${String(response.status)}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('malformed', 'La API respondio con un cuerpo que no es JSON valido');
  }

  const parsed = parse(payload);
  if (parsed === undefined) {
    throw new ApiError('malformed', 'La respuesta de la API no tiene la forma esperada');
  }

  return parsed;
}

function toRequestError(cause: unknown, signal: AbortSignal | undefined): ApiError {
  if (cause instanceof DOMException && cause.name === 'TimeoutError') {
    return new ApiError('timeout', 'La API ha tardado demasiado en responder');
  }
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    // Distinguimos la cancelacion nuestra del limite de tiempo: la primera no
    // es un error que haya que mostrar al usuario.
    return signal?.aborted === true
      ? new ApiError('aborted', 'Peticion cancelada')
      : new ApiError('timeout', 'La API ha tardado demasiado en responder');
  }
  return new ApiError('network', 'No se ha podido contactar con la API');
}
