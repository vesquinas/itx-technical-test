import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';

import { CartProvider } from './cart/CartProvider.tsx';
import { RouteFallback } from './components/RouteFallback.tsx';

/**
 * Every route is lazily loaded.
 *
 * Each ends up in its own chunk, so whoever opens the list does not download the detail page's
 * code, and vice versa. That is why no manual chunking needs configuring in the bundler.
 *
 * `React.lazy` needs a default export, and the rest of the project uses named exports so that
 * names stay stable across refactors. It is adapted here, in one single place.
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
 * The application root.
 *
 * It is a SPA with client-side routing (`BrowserRouter`), with no server rendering and no document
 * navigation, as the brief requires.
 *
 * The cart provider wraps the router so the counter survives view changes: were it inside a route,
 * it would reset on every navigation.
 */
export function App() {
  return (
    <CartProvider>
      {/* `basename` follows the build's base path, so a deployment under a sub-path routes
          correctly without touching any of this. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<ProductListPage />} path="/" />
            <Route element={<ProductDetailPage />} path="/product/:productId" />

            {/*
              The brief describes two views, and these are the two. This third route is not a third
              view of the application but its answer to a URL that matches neither: without it, a
              mistyped address renders a blank page, which is the one behaviour a single-page
              application must not have. It carries the same header, so the way back is always
              there. See the README.
            */}
            <Route element={<NotFoundPage />} path="*" />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </CartProvider>
  );
}
