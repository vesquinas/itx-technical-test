import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';

import { CartProvider } from './cart/CartProvider.tsx';
import { RouteFallback } from './components/RouteFallback.tsx';

/**
 * Las dos vistas se cargan en diferido.
 *
 * Cada una acaba en su propio fragmento, de modo que quien abre el listado no
 * descarga el código de la ficha ni al reves. Es el motivo por el que no hace
 * falta configurar el troceado manual del bundler.
 *
 * `React.lazy` necesita una exportacion por defecto, y en el resto del proyecto
 * se usan exportaciones nombradas para que los nombres sean estables al
 * refactorizar. Se adapta aquí, en un solo punto.
 */
const ProductListPage = lazy(async () => {
  const module = await import('./pages/ProductListPage.tsx');
  return { default: module.ProductListPage };
});

const ProductDetailPage = lazy(async () => {
  const module = await import('./pages/ProductDetailPage.tsx');
  return { default: module.ProductDetailPage };
});

const NotFoundPage = lazy(async () => {
  const module = await import('./pages/NotFoundPage.tsx');
  return { default: module.NotFoundPage };
});

/**
 * Raiz de la aplicación.
 *
 * Es una SPA con enrutado en cliente (`BrowserRouter`), sin renderizado en
 * servidor y sin navegación entre documentos, como exige el enunciado.
 *
 * El proveedor de la cesta envuelve al enrutador para que el contador sobreviva
 * a los cambios de vista: si estuviera dentro de una ruta, se reiniciaria en cada
 * navegación.
 */
export function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<ProductListPage />} path="/" />
            <Route element={<ProductDetailPage />} path="/product/:productId" />
            {/* Comodin: evita la pantalla en blanco ante una URL desconocida. */}
            <Route element={<NotFoundPage />} path="*" />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </CartProvider>
  );
}
