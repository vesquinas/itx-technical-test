import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/client.ts';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: ApiError };

/** Resultado ya resuelto, sea con datos o con error. */
type SettledState<T> = Exclude<AsyncState<T>, { status: 'loading' }>;

export interface AsyncResource<T> {
  state: AsyncState<T>;
  /**
   * `true` cuando la carga se esta alargando mas de lo normal.
   *
   * La API de la prueba esta en un plan gratuito que apaga el servicio sin
   * trafico: la primera peticion tarda unos 40 segundos en arrancarlo y las
   * siguientes responden en milisegundos. Con esta senal la interfaz puede
   * explicar la espera larga sin hacer parpadear un mensaje alarmante en cada
   * carga rapida.
   */
  isSlow: boolean;
  /** Vuelve a intentar la carga. Se usa desde el boton de reintento. */
  reload: () => void;
}

/** Margen antes de avisar de que la espera se esta alargando. */
const SLOW_REQUEST_MS = 3_000;

function toApiError(cause: unknown): ApiError {
  return cause instanceof ApiError
    ? cause
    : new ApiError('network', 'Se ha producido un error inesperado al cargar los datos');
}

/**
 * Carga un recurso asincrono y expone su estado como una union discriminada.
 *
 * El tipo `AsyncState` es lo que hace que un componente no pueda olvidarse de un
 * caso: no existe un estado en el que `data` y `error` esten ambos definidos, ni
 * uno en el que se pinte la vista con los datos todavia sin llegar.
 *
 * ## Por que hay un `requestId`
 *
 * El estado de carga se **deriva** durante el renderizado comparando el
 * identificador de la peticion en curso con el del ultimo resultado guardado. La
 * alternativa evidente —poner el estado a "cargando" dentro del efecto— provoca
 * un renderizado extra en cada cambio y deja una ventana en la que la vista
 * muestra datos del producto anterior.
 *
 * Ademas resuelve el problema de las respuestas que llegan desordenadas: si el
 * usuario navega de un producto a otro y la primera respuesta llega despues de la
 * segunda, su identificador ya no coincide y se descarta.
 *
 * `load` tiene que ser estable (envuelta en `useCallback` por quien llama).
 */
export function useAsyncResource<T>(
  /** Identifica el recurso pedido. Al cambiar, se vuelve a cargar. */
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): AsyncResource<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ id: string; state: SettledState<T> }>();
  const [slowRequestId, setSlowRequestId] = useState<string>();

  const requestId = `${key}#${String(attempt)}`;

  useEffect(() => {
    const controller = new AbortController();
    const slowTimer = setTimeout(() => {
      setSlowRequestId(requestId);
    }, SLOW_REQUEST_MS);

    const run = async () => {
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted) {
          setResult({ id: requestId, state: { status: 'ready', data } });
        }
      } catch (cause) {
        // Una peticion cancelada no es un error que mostrar: la vista que la
        // pidio ya no esta en pantalla.
        if (!controller.signal.aborted) {
          setResult({ id: requestId, state: { status: 'error', error: toApiError(cause) } });
        }
      }
    };

    void run();

    return () => {
      clearTimeout(slowTimer);
      controller.abort();
    };
  }, [load, requestId]);

  const reload = useCallback(() => {
    setAttempt((previous) => previous + 1);
  }, []);

  const state: AsyncState<T> =
    result?.id === requestId ? result.state : { status: 'loading' };

  // Se derivan durante el renderizado, comparando con la peticion en curso: asi
  // el aviso desaparece por si solo al empezar una carga nueva.
  const isSlow = state.status === 'loading' && slowRequestId === requestId;

  return { state, isSlow, reload };
}
