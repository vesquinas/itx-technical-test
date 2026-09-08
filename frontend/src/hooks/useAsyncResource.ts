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
 * Loads an async resource and exposes its state as a discriminated union.
 *
 * The `AsyncState` type is what keeps a component from forgetting a case: there is no state in
 * which `data` and `error` are both defined, nor one in which the view is painted with the data
 * still on its way.
 *
 * ## Why there is a `requestId`
 *
 * The loading state is **derived** during render by comparing the identifier of the in-flight
 * request with that of the last stored result. The obvious alternative — setting the state to
 * "loading" inside the effect — causes an extra render on every change and leaves a window in
 * which the view shows the previous product's data.
 *
 * It also solves out-of-order responses: if the user navigates from one product to another and the
 * first response arrives after the second, its identifier no longer matches and it is discarded.
 *
 * `load` takes no abort signal. Cancelling the network was never this hook's job: the requests it
 * drives are shared and cached, so a request nobody is waiting for any more still has a result
 * worth keeping. What the hook needs is not to *apply* a result that is no longer current, and
 * that is what the flag in the cleanup and the identifier comparison are for.
 *
 * `load` has to be stable (wrapped in `useCallback` by the caller), and `key` has to change
 * **whenever** `load` changes. That is the hook's contract: the loading state is derived by
 * comparing identifiers, so if `load` started pointing at a different resource without the key
 * changing, the view would show the previous resource's data while the new one arrived. Both call
 * sites in this application satisfy it by construction, because `key` is composed of the same
 * dependencies as `load`'s `useCallback`.
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
