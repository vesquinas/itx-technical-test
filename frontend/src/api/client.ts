/**
 * The application's HTTP client.
 *
 * Its responsibilities: building URLs safely, imposing a time limit on every request, and
 * translating any failure into a typed error the interface can explain to the user.
 */

import type { Parser } from '../lib/parse.ts';

const DEFAULT_BASE_URL = 'https://itx-frontend-test.onrender.com';

/**
 * The test API is hosted on Render's free tier, which shuts the service down when it receives no
 * traffic. The first request after a period of inactivity takes about 40 seconds to answer because
 * the service has to boot (measured). A "normal" 10-second limit would make the first load fail
 * every time, so a generous margin is taken and it is the interface that warns the user the wait
 * may be long.
 */
export const DEFAULT_TIMEOUT_MS = 60_000;

export type ApiFailureKind =
  /** No response at all: no connection, DNS, CORS or a downed server. */
  | 'network'
  /** The time limit ran out. */
  | 'timeout'
  /** The resource does not exist (404). */
  | 'notFound'
  /** It answered with an error status other than 404. */
  | 'http'
  /** It answered, but the body does not have the expected shape. */
  | 'malformed'
  /** The request was cancelled from the application (a view change, for instance). */
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
  // Normalised so `new URL` does not drop segments of the base path.
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/**
 * Builds the URL out of already-encoded segments.
 *
 * `encodeURIComponent` is applied to each segment rather than interpolating into a template: an
 * identifier containing `../` or `?` must not be able to change the path or add parameters to the
 * request.
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
 * Performs the request and validates the response with `parse`.
 *
 * Returning the already-validated type (rather than `unknown` or an `as`) is what lets the rest of
 * the application trust its data.
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
      `La API respondió con el código ${String(response.status)}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('malformed', 'La API respondió con un cuerpo que no es JSON válido');
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
    // We tell our own cancellation apart from the time limit: the former is not an error to show
    // to the user.
    return signal?.aborted === true
      ? new ApiError('aborted', 'Petición cancelada')
      : new ApiError('timeout', 'La API ha tardado demasiado en responder');
  }
  return new ApiError('network', 'No se ha podido contactar con la API');
}
