import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { CartProvider } from '../cart/CartProvider.tsx';

/**
 * Monta un componente con el contexto que necesita en producción: el proveedor
 * de la cesta y un enrutador en memoria.
 *
 * Se usa `MemoryRouter` en lugar de `BrowserRouter` porque no depende de la API
 * de historial del navegador, con lo que cada test arranca en la ruta que
 * necesita y no interfiere con los demas.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: { route?: string; path?: string } = {},
): RenderResult {
  const { route = '/', path = '/' } = options;

  return render(
    <CartProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route element={ui} path={path} />
        </Routes>
      </MemoryRouter>
    </CartProvider>,
  );
}
