/**
 * A `fetch` stub that honours the `AbortSignal`, the way a browser does.
 *
 * The plain `vi.fn(() => Promise.resolve(response))` used elsewhere ignores the signal entirely, so
 * a request that the application aborts still resolves with data. That is not what happens in a
 * browser, and the difference hid a real defect: under strict mode React mounts, unmounts and
 * remounts, the unmount aborts the in-flight request, and anything sharing that request inherits
 * the abort. With an unfaithful stub the tests could not see it.
 */

export interface AbortableStubOptions {
  /** Milliseconds before the response resolves. The default settles after the current task. */
  delayMs?: number;
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Builds a response function that rejects with an `AbortError` if the request is aborted before it
 * settles — which is exactly what the platform does.
 */
export function abortAwareJson(
  payload: unknown,
  { delayMs = 0 }: AbortableStubOptions = {},
): (url: string, init?: RequestInit) => Promise<Response> {
  return (_url, init) =>
    new Promise<Response>((resolve, reject) => {
      const abort = () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      };

      if (init?.signal?.aborted === true) {
        abort();
        return;
      }

      const timer = setTimeout(() => {
        resolve(jsonResponse(payload));
      }, delayMs);

      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        abort();
      });
    });
}
