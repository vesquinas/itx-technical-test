import type { ReactElement } from 'react';
import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { CartProvider } from '../cart/CartProvider.tsx';

/**
 * Mounts a component with the context it needs in production: the cart provider and an in-memory
 * router.
 *
 * `MemoryRouter` is used instead of `BrowserRouter` because it does not depend on the browser's
 * history API, so every test starts on the route it needs and does not interfere with the others.
 *
 * **`StrictMode` is here because `main.tsx` has it.** A harness that renders a different tree from
 * the real application is a harness that cannot see a whole class of defect: strict mode
 * deliberately mounts, unmounts and remounts every component, and anything that does not survive
 * that is broken in development for everyone who runs `npm start`. Leaving it out hid exactly such
 * a defect until an external review found it.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: { route?: string; path?: string } = {},
): RenderResult {
  const { route = '/', path = '/' } = options;

  return render(
    <StrictMode>
      <CartProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route element={ui} path={path} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </StrictMode>,
  );
}
