import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const DEFAULT_API_BASE_URL = 'https://itx-frontend-test.onrender.com';

function originOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    // Falla la compilacion en lugar de emitir una politica silenciosamente incompleta:
    // una CSP mal formada no protege y no avisa.
    throw new Error(
      `VITE_API_BASE_URL no es una URL absoluta valida: ${baseUrl}. ` +
        'Se necesita para construir la Content-Security-Policy.',
    );
  }
}

/**
 * Inyecta la Content-Security-Policy en el HTML compilado.
 *
 * Es la segunda linea de defensa frente a XSS: la primera es que React escapa el texto por
 * defecto y que el linter prohibe `dangerouslySetInnerHTML`. Si aun asi se colara una
 * inyeccion, la politica impide que el navegador ejecute el script.
 *
 * ## Por que se puede ser estricto aqui
 *
 * `script-src 'self'` y `style-src 'self'` (sin `unsafe-inline`) solo son viables si la
 * aplicacion no tiene ni un script ni un estilo en linea. Se comprobo sobre el HTML compilado
 * y sobre el codigo fuente: no hay ninguno. Los estilos son CSS Modules, que salen como
 * ficheros enlazados, y no se usa el atributo `style` en ningun componente.
 *
 * ## Por que solo en la compilacion de produccion
 *
 * El servidor de desarrollo inyecta scripts en linea para la recarga en caliente. Aplicar la
 * politica tambien ahi la rompe, asi que el plugin declara `apply: 'build'`.
 *
 * ## Lo que una CSP en `<meta>` NO puede hacer
 *
 * `frame-ancestors`, `report-uri` y `sandbox` se ignoran cuando la politica llega en una
 * etiqueta y no en una cabecera HTTP. La proteccion contra clickjacking, por tanto, tiene que
 * configurarla quien sirva los ficheros. Queda anotado en el README en lugar de incluir una
 * directiva que no haria nada.
 */
function contentSecurityPolicy(apiOrigin: string): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // Las fotos del catalogo se sirven desde el mismo origen que la API.
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
  const apiOrigin = originOf(env['VITE_API_BASE_URL'] ?? DEFAULT_API_BASE_URL);

  return {
    plugins: [react(), contentSecurityPolicy(apiOrigin)],
    build: {
      target: 'es2022',
      // No se configura troceado manual: las rutas se cargan con `React.lazy`,
      // asi que el bundler ya genera un fragmento por vista.
      sourcemap: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      },
    },
  };
});
