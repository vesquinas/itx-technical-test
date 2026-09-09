import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const DEFAULT_API_BASE_URL = 'https://itx-frontend-test.onrender.com';

function originOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    // Fail the build rather than emitting a silently incomplete policy: a malformed CSP does not
    // protect and does not warn.
    throw new Error(
      `VITE_API_BASE_URL is not a valid absolute URL: ${baseUrl}. ` +
        'It is needed to build the Content-Security-Policy.',
    );
  }
}

/**
 * Forwards `/api` to the API from the application's own origin.
 *
 * No cookie rewriting is needed, and it is worth saying why: the API sends
 * `session_id=…; Path=/; HttpOnly` with **no `Domain` attribute**, so the cookie is host-only and
 * the browser scopes it to whoever answered the request — the proxy. Measured both ways: the
 * session accumulates identically with and without `cookieDomainRewrite`. It would only be needed
 * if the API started pinning the cookie to its own domain.
 */
function apiProxy(apiOrigin: string) {
  return { '/api': { target: apiOrigin, changeOrigin: true } };
}

/**
 * Opens the connection to the API before the code needs it.
 *
 * It saves the DNS resolution and the TLS negotiation from the critical path, and with this API it
 * counts double because its first response is slow to begin with. The images are served from that
 * origin too, so the hint is worth having even when the API itself is proxied through our own.
 *
 * It is generated from the resolved origin rather than written into `index.html`, because a
 * hard-coded hint and a generated policy drift apart the moment the API URL is configured — which
 * is exactly what happened, and what the build's own CSP check then caught.
 */
function connectionHints(apiOrigin: string): Plugin {
  return {
    name: 'itx:connection-hints',
    apply: 'build',
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'preconnect', href: apiOrigin, crossorigin: '' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'dns-prefetch', href: apiOrigin }, injectTo: 'head' },
      ];
    },
  };
}

/**
 * Injects the Content-Security-Policy into the built HTML.
 *
 * It is the second line of defence against XSS: the first is that React escapes text by default
 * and that the linter forbids `dangerouslySetInnerHTML`. Should an injection still get through,
 * the policy stops the browser from executing the script.
 *
 * ## Why we can be strict here
 *
 * `script-src 'self'` and `style-src 'self'` (without `unsafe-inline`) are only viable if the
 * application has not a single inline script or style. That was checked against the built HTML and
 * against the source: there is none. The styles are CSS Modules, which come out as linked files,
 * and the `style` attribute is not used in any component.
 *
 * ## Why only in the production build
 *
 * The development server injects inline scripts for hot reload. Applying the policy there breaks
 * it, so the plugin declares `apply: 'build'`.
 *
 * ## What a `<meta>` CSP CANNOT do
 *
 * `frame-ancestors`, `report-uri` and `sandbox` are ignored when the policy arrives in a tag
 * rather than in an HTTP header. Clickjacking protection therefore has to be configured by
 * whoever serves the files. That is noted in the README instead of including a directive that
 * would do nothing.
 */
function contentSecurityPolicy(apiOrigin: string): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // The catalogue photos are served from the same origin as the API.
    `img-src 'self' ${apiOrigin}`,
    `connect-src 'self' ${apiOrigin}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');

  return {
    name: 'itx:content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const configured = env['VITE_API_BASE_URL'];

  // The proxy target and the Content-Security-Policy both need an absolute origin. A relative
  // value — which is what development uses, so requests go through the proxy — says nothing about
  // where the API actually lives, so the default applies in that case.
  const apiOrigin = originOf(
    configured !== undefined && /^https?:\/\//i.test(configured) ? configured : DEFAULT_API_BASE_URL,
  );

  return {
    plugins: [react(), contentSecurityPolicy(apiOrigin), connectionHints(apiOrigin)],

    /**
     * The development server proxies the API, and that is not a convenience: it is what makes the
     * cart work.
     *
     * The API keeps the basket in a server-side session identified by an `HttpOnly` cookie. Two
     * independent things stop a browser from ever using that cookie across origins: the cookie
     * carries no `SameSite=None; Secure`, so it is not sent on cross-site requests; and the API
     * answers `Access-Control-Allow-Origin: *` with no `Access-Control-Allow-Credentials`, which
     * forbids credentialed cross-origin requests outright. With every request opening a fresh
     * session, the API answers `{"count": 1}` for ever.
     *
     * Proxying through the development server makes the requests same-origin, so the browser sends
     * the cookie, the session persists and the counter climbs.
     *
     * No cookie rewriting is needed, and it is worth saying why: the API sends
     * `session_id=…; Path=/; HttpOnly` with **no `Domain` attribute**, so the cookie is host-only
     * and the browser scopes it to whoever answered the request — the proxy. Measured both ways:
     * the session accumulates identically with and without `cookieDomainRewrite`. It would only
     * be needed if the API started pinning the cookie to its own domain.
     */
    server: { proxy: apiProxy(apiOrigin) },

    /**
     * The same proxy for `vite preview`, which serves the production build.
     *
     * That combination — the real build, served from one origin that also forwards `/api` — is the
     * topology of a deployment sitting behind a gateway, and it is what `npm run preview:deployed`
     * puts together. It exists so the claim that a real deployment has a working cart is something
     * anyone can reproduce in one command instead of taking on trust.
     */
    preview: { proxy: apiProxy(apiOrigin) },
    build: {
      target: 'es2022',
      // No manual chunking is configured: the routes are loaded with `React.lazy`, so the
      // bundler already produces one chunk per view.

      /**
       * **A production build ships no source maps**, and this used to be `true`.
       *
       * With `true`, the deployed demo served `index-*.js.map`: 1.2 MB carrying the
       * `sourcesContent` of thirty-four files, which is the entire TypeScript source. Here that
       * leaks nothing — the brief requires a public repository, so the source is public by
       * construction — but it was **correct by accident rather than by decision**, which is how a
       * review put it, and in a deployment whose source is not public it is a finding.
       *
       * So the default is off, and the maps are opt-in for whoever needs to debug a built bundle:
       *
       *     VITE_SOURCEMAPS=true npm run build
       *
       * The alternative a real service uses is `'hidden'` plus uploading the maps to the error
       * tracker, so stack traces are readable there and nothing is served to the public. That needs
       * an error tracker, which this does not have.
       */
      sourcemap: process.env['VITE_SOURCEMAPS'] === 'true',
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,

      /**
       * Deadlines, and why they are not the defaults.
       *
       * Seventeen files run in parallel, each with its own jsdom, and some of what they wait for is
       * genuinely slow under load: a route behind `React.lazy` resolving a dynamic import, or axe
       * walking the whole rendered tree. With the default five seconds, loading every core made
       * three runs out of four fail — never the same test twice, never in isolation, and never for
       * a reason other than the clock.
       *
       * They also have to be ordered. Raising Testing Library's wait to five seconds first was no
       * fix at all: it ran straight into *this* ceiling, and the failure came back as
       * `Test timed out in 5000ms`, which says nothing about what was being waited for. The waiting
       * budget stays strictly below the test's, so a real failure is reported by the library that
       * knows what it wanted — with the element it could not find and the DOM it searched.
       */
      testTimeout: 20_000,
      hookTimeout: 20_000,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      },
    },
  };
});
