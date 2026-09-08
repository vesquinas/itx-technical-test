import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/client.ts';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: ApiError };

/** An already-settled result, whether with data or with an error. */
type SettledState<T> = Exclude<AsyncState<T>, { status: 'loading' }>;

export interface AsyncResource<T> {
  state: AsyncState<T>;
  /**
   * `true` when the load is taking longer than usual.
   *
   * The test API sits on a free tier that shuts the service down without traffic: the first
   * request takes about 40 seconds to start it and the following ones answer in milliseconds. With
   * this signal the interface can explain the long wait without flashing an alarming message on
   * every fast load.
   */
  isSlow: boolean;
  /** Tries the load again. Used by the retry button. */
  reload: () => void;
}

/** Grace period before warning that the wait is getting long. */
const SLOW_REQUEST_MS = 3_000;

function toApiError(cause: unknown): ApiError {
  return cause instanceof ApiError
    ? cause
    : new ApiError('network', 'Se ha producido un error inesperado al cargar los datos');
}

/**
 * Loads an async resource and exposes its state as a discriminated union, so there is no state in
 * which `data` and `error` are both defined.
 *
 * The loading state is **derived** during render, by comparing the identifier of the in-flight
 * request with that of the last stored result. Setting it inside the effect instead costs an extra
 * render on every change and leaves a window where the view shows the previous product's data. The
 * comparison also discards an out-of-order response: one that arrives after a newer request no
 * longer matches.
 *
 * `load` takes no abort signal: the requests it drives are shared and cached, so one nobody waits
 * for still has a result worth keeping. What matters is not *applying* a stale result, which the
 * identifier comparison and the cleanup flag handle.
 *
 * **Contract:** `load` must be stable and `key` must change whenever `load` does. Otherwise the
 * derived state would show the previous resource while the new one loads. Both call sites satisfy
 * it because `key` is built from the same dependencies as `load`'s `useCallback`.
 */
export function useAsyncResource<T>(
  /** Identifies the requested resource. When it changes, the resource is loaded again. */
  key: string,
  load: () => Promise<T>,
): AsyncResource<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ id: string; state: SettledState<T> }>();
  const [slowRequestId, setSlowRequestId] = useState<string>();

  const requestId = `${key}#${String(attempt)}`;

  useEffect(() => {
    let current = true;
    const slowTimer = setTimeout(() => {
      setSlowRequestId(requestId);
    }, SLOW_REQUEST_MS);

    const run = async () => {
      try {
        const data = await load();
        // A result that arrives after the effect was torn down belongs to a view that is no longer
        // on screen, so it is read and dropped rather than applied.
        if (current) {
          setResult({ id: requestId, state: { status: 'ready', data } });
        }
      } catch (cause) {
        if (current) {
          setResult({ id: requestId, state: { status: 'error', error: toApiError(cause) } });
        }
      }
    };

    void run();

    return () => {
      current = false;
      clearTimeout(slowTimer);
    };
  }, [load, requestId]);

  const reload = useCallback(() => {
    setAttempt((previous) => previous + 1);
  }, []);

  const state: AsyncState<T> =
    result?.id === requestId ? result.state : { status: 'loading' };

  // Derived during render by comparing against the in-flight request, so the warning disappears
  // on its own when a new load starts.
  const isSlow = state.status === 'loading' && slowRequestId === requestId;

  return { state, isSlow, reload };
}
