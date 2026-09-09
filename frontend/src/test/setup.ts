import '@testing-library/jest-dom/vitest';

import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/**
 * How long a `findBy*` waits before giving up.
 *
 * The default is one second, and that is not a budget for a machine under load: seventeen test
 * files run in parallel, each with its own jsdom, and a route behind `React.lazy` has to resolve a
 * dynamic import before it can render. Measured by loading every core and running the suite four
 * times: **three of the four runs failed**, in two different tests, both of them waiting for a view
 * to appear. Neither was a logic error — the same runs pass on an idle machine and in isolation.
 *
 * A test that only fails when the machine is busy is worse than a slow one: it teaches whoever sees
 * it to run the suite again, which is exactly how a real regression gets through. So the deadline
 * moves to eight seconds, and vitest's own `testTimeout` to twenty — **in that order**, because
 * raising this one to five while the test timeout was also five simply moved the failure to a worse
 * message: `Test timed out in 5000ms`, which does not say what was being waited for. This budget
 * has to stay below that one for a real failure to be reported by the library that knows what it
 * was looking for.
 *
 * A passing test is no slower for any of this: the wait ends when the element appears, not when the
 * budget does. What changes is only how long the suite waits before calling something broken.
 */
configure({ asyncUtilTimeout: 8_000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
