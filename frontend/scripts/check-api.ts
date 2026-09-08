/**
 * Valida los parsers de la aplicación contra la API real, entera.
 *
 * Los tests usan fixtures: respuestas reales copiadas, pero solo unas pocas. Este script
 * recorre **los 100 productos del catálogo** con el mismo código que usa la aplicación y
 * comprueba que ninguno produce un resultado que la interfaz no pueda pintar.
 *
 * Sirve para dos cosas distintas:
 *
 *  1. Detectar un producto raro que las fixtures no cubren. Así se encontró que 1 de cada 5
 *     productos tiene vacío alguno de los atributos que el enunciado exige.
 *  2. Avisar si la API cambia. Si algún día corrigen los campos intercambiados o los nombres
 *     mal escritos, este script lo dice y habrá que ajustar la traducción a propósito.
 *
 * No está en integración continua: necesita red y la API tarda unos 40 segundos en despertar.
 * Se ejecuta a mano con `npm run check:api`.
 */

import { parseProductDetail, parseProductList } from '../src/api/schema.ts';
import type { ProductDetail } from '../src/domain/product.ts';

const BASE_URL = process.env['VITE_API_BASE_URL'] ?? 'https://itx-frontend-test.onrender.com';
const CONCURRENCIA = 8;

/** Atributos que el enunciado exige mostrar «al menos». */
const OBLIGATORIOS: readonly (readonly [string, (p: ProductDetail) => string])[] = [
  ['Marca', (p) => p.brand],
  ['Modelo', (p) => p.model],
  ['Precio', (p) => (p.price === null ? '' : String(p.price))],
  ['Procesador', (p) => p.specs.cpu.join(' ')],
  ['Memoria RAM', (p) => p.specs.ram],
  ['Sistema operativo', (p) => p.specs.operatingSystem.join(' ')],
  ['Resolución de pantalla', (p) => p.specs.screenResolution],
  ['Batería', (p) => p.specs.battery],
  ['Cámara principal', (p) => p.specs.primaryCamera.join(' ')],
  ['Cámara frontal', (p) => p.specs.secondaryCamera.join(' ')],
  ['Dimensiones', (p) => p.specs.dimensions],
  ['Peso', (p) => p.specs.weight],
];

async function pedirJson(ruta: string): Promise<unknown> {
  const respuesta = await fetch(new URL(ruta, `${BASE_URL}/`), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(90_000),
  });
  if (!respuesta.ok) throw new Error(`${ruta} respondió ${String(respuesta.status)}`);
  return respuesta.json();
}

async function enLotes<T, R>(
  elementos: readonly T[],
  tamano: number,
  tarea: (elemento: T) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = [];
  for (let inicio = 0; inicio < elementos.length; inicio += tamano) {
    const lote = elementos.slice(inicio, inicio + tamano);
    resultados.push(...(await Promise.all(lote.map(tarea))));
  }
  return resultados;
}

const errores: string[] = [];
const avisos: string[] = [];

console.log(`Consultando ${BASE_URL} (la primera petición puede tardar ~40 s)…`);

const listaSinValidar = await pedirJson('api/product');
const lista = parseProductList(listaSinValidar);
if (lista === undefined) {
  console.error('FALLO: el listado no supera la validación. La API ha cambiado de forma.');
  process.exit(1);
}

const brutos = Array.isArray(listaSinValidar) ? listaSinValidar.length : 0;
console.log(`Listado: ${String(brutos)} productos, ${String(lista.length)} válidos.`);
if (lista.length !== brutos) {
  errores.push(`${String(brutos - lista.length)} productos del listado no superan la validación`);
}
for (const producto of lista) {
  if (producto.imageUrl.length === 0) avisos.push(`${producto.model}: sin imagen utilizable`);
}

console.log('Consultando el detalle de cada producto…');
const detalles = await enLotes(lista, CONCURRENCIA, async (resumen) => {
  const bruto = await pedirJson(`api/product/${encodeURIComponent(resumen.id)}`);
  return { resumen, detalle: parseProductDetail(bruto), bruto };
});

const sinAtributo = new Map<string, string[]>();

for (const { resumen, detalle, bruto } of detalles) {
  if (detalle === undefined) {
    errores.push(`${resumen.model}: el detalle no supera la validación`);
    continue;
  }

  for (const [etiqueta, leer] of OBLIGATORIOS) {
    if (leer(detalle).length === 0) {
      sinAtributo.set(etiqueta, [...(sinAtributo.get(etiqueta) ?? []), detalle.model]);
    }
  }

  if (detalle.options.colors.length === 0 || detalle.options.storages.length === 0) {
    errores.push(`${detalle.model}: sin colores o sin capacidades, no se podría comprar`);
  }

  // Las particularidades documentadas de esta API. Si dejan de cumplirse, la API se ha
  // corregido y hay que revisar la traduccion: dejar de cruzar los campos, por ejemplo.
  const fuente = bruto as Record<string, unknown>;
  if (!('dimentions' in fuente)) avisos.push(`${detalle.model}: ya no existe el campo mal escrito 'dimentions'`);
  if (!('secondaryCmera' in fuente)) avisos.push(`${detalle.model}: ya no existe 'secondaryCmera'`);
  if (typeof fuente['displaySize'] === 'string' && !/pixel/i.test(fuente['displaySize'])) {
    avisos.push(`${detalle.model}: 'displaySize' ya no trae píxeles; ¿han deshecho el intercambio?`);
  }
}

console.log(`\nProductos consultados: ${String(detalles.length)}`);
console.log('\nAtributos obligatorios sin valor en la API (se muestran como «No disponible»):');
if (sinAtributo.size === 0) {
  console.log('  ninguno');
} else {
  for (const [etiqueta, modelos] of [...sinAtributo].toSorted((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${etiqueta}: ${String(modelos.length)} productos (${modelos.slice(0, 3).join(', ')}…)`);
  }
}

if (avisos.length > 0) {
  console.log(`\n${String(avisos.length)} aviso(s):`);
  for (const aviso of [...new Set(avisos)].slice(0, 10)) console.log(`  ${aviso}`);
}

if (errores.length > 0) {
  console.error(`\n${String(errores.length)} error(es):`);
  for (const error of errores.slice(0, 15)) console.error(`  ${error}`);
  process.exit(1);
}

console.log('\nTodos los productos del catálogo se traducen correctamente.');
