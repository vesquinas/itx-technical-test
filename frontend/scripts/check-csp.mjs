/**
 * Verifica que la Content-Security-Policy del HTML compilado cubre todo lo que la
 * página carga de verdad.
 *
 * Existe porque una CSP mal ajustada no avisa: el navegador bloquea el recurso en
 * silencio y la aplicación se rompe en producción y no en desarrollo, donde la
 * política ni se aplica. Este script cierra ese hueco sin necesidad de un
 * navegador, comprobando cuatro cosas sobre el resultado real de la compilación:
 *
 *   1. Que la política existe y trae las directivas que se esperan.
 *   2. Que no hay ni un script ni un estilo en línea, que es lo único que
 *      justifica poder prescindir de `unsafe-inline`.
 *   3. Que todo lo que la página referencia es del mismo origen.
 *   4. Que el origen de la API está permitido para conectarse y para imágenes.
 *
 * Se ejecuta en integración continua después de compilar.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const DEFAULT_API_BASE_URL = 'https://itx-frontend-test.onrender.com';

const problemas = [];
const comprobaciones = [];

function comprobar(descripcion, condicion, detalle = '') {
  if (condicion) {
    comprobaciones.push(descripcion);
  } else {
    problemas.push(`${descripcion}${detalle ? ` — ${detalle}` : ''}`);
  }
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// 1. La política existe y se puede leer.
const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html);
comprobar('el HTML compilado declara una Content-Security-Policy', meta !== null);

if (meta !== null) {
  const policy = meta[1].replaceAll('&#39;', "'").replaceAll('&amp;', '&');
  const directivas = new Map(
    policy
      .split(';')
      .map((parte) => parte.trim())
      .filter(Boolean)
      .map((parte) => {
        const [nombre, ...valores] = parte.split(/\s+/);
        return [nombre, valores];
      }),
  );

  for (const esperada of [
    'default-src',
    'script-src',
    'style-src',
    'img-src',
    'connect-src',
    'object-src',
    'base-uri',
    'form-action',
  ]) {
    comprobar(`la política declara ${esperada}`, directivas.has(esperada));
  }

  comprobar(
    "script-src no permite 'unsafe-inline'",
    !(directivas.get('script-src') ?? []).includes("'unsafe-inline'"),
  );
  comprobar(
    "style-src no permite 'unsafe-inline'",
    !(directivas.get('style-src') ?? []).includes("'unsafe-inline'"),
  );

  // 4. El origen de la API tiene que estar permitido, o la aplicación no carga datos.
  const apiOrigin = new URL(process.env['VITE_API_BASE_URL'] ?? DEFAULT_API_BASE_URL).origin;
  for (const directiva of ['connect-src', 'img-src']) {
    comprobar(
      `${directiva} permite el origen de la API (${apiOrigin})`,
      (directivas.get(directiva) ?? []).includes(apiOrigin),
    );
  }
}

// 2. Nada en línea. Es la condición que permite prescindir de `unsafe-inline`.
const scriptsEnLinea = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((coincidencia) => coincidencia[1].trim())
  .filter(Boolean);
comprobar('no hay scripts en línea', scriptsEnLinea.length === 0, `${scriptsEnLinea.length} encontrados`);

const estilosEnLinea = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
  .map((coincidencia) => coincidencia[1].trim())
  .filter(Boolean);
comprobar('no hay estilos en línea', estilosEnLinea.length === 0, `${estilosEnLinea.length} encontrados`);

comprobar('ningún elemento usa el atributo style', !/\sstyle="/i.test(html));

// 3. Lo que referencia el documento es del mismo origen o de un origen permitido.
//
// El origen de la API sí aparece, en las etiquetas `preconnect` y `dns-prefetch`, y es
// correcto: son sugerencias de conexión, no cargas de recursos, y además está permitido en
// la política. Lo que se busca aquí es un tercer origen que se hubiera colado sin declarar.
const apiOriginPermitido = new URL(
  process.env['VITE_API_BASE_URL'] ?? DEFAULT_API_BASE_URL,
).origin;
const referencias = [...html.matchAll(/\s(?:src|href)="([^"]+)"/gi)].map(
  (coincidencia) => coincidencia[1],
);
const externasNoDeclaradas = referencias.filter((referencia) => {
  if (!/^[a-z]+:/i.test(referencia) || referencia.startsWith('data:')) return false;
  try {
    return new URL(referencia).origin !== apiOriginPermitido;
  } catch {
    return true;
  }
});
comprobar(
  'el documento no referencia orígenes sin declarar en la política',
  externasNoDeclaradas.length === 0,
  externasNoDeclaradas.join(', '),
);

// Y lo mismo para las hojas de estilo compiladas: un `url()` externo lo bloquearía img-src.
const assets = join(DIST, 'assets');
const urlsExternasEnCss = readdirSync(assets)
  .filter((nombre) => nombre.endsWith('.css'))
  .flatMap((nombre) =>
    [...readFileSync(join(assets, nombre), 'utf8').matchAll(/url\(\s*['"]?([^'")]+)/gi)]
      .map((coincidencia) => coincidencia[1])
      .filter((referencia) => /^[a-z]+:\/\//i.test(referencia)),
  );
comprobar(
  'el CSS compilado no carga recursos de otro origen',
  urlsExternasEnCss.length === 0,
  urlsExternasEnCss.join(', '),
);

for (const descripcion of comprobaciones) {
  console.log(`  ok  ${descripcion}`);
}
for (const problema of problemas) {
  console.error(`  FALLO  ${problema}`);
}

if (problemas.length > 0) {
  console.error(`\n${problemas.length} comprobación(es) de CSP han fallado.`);
  process.exit(1);
}
console.log(`\n${comprobaciones.length} comprobaciones de CSP superadas.`);
