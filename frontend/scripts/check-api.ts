/**
 * Validates the application's parsers against the real API, all of it.
 *
 * The tests use fixtures: real responses, copied verbatim, but only a handful. This script walks
 * **the 100 products of the catalogue** with the same code the application uses and checks that
 * none of them produces a result the interface cannot render.
 *
 * It serves two distinct purposes:
 *
 *  1. Catching an odd product the fixtures do not cover. That is how it was found that 1 in 5
 *     products has one of the attributes the brief requires empty.
 *  2. Warning if the API changes. If the swapped fields or the misspelled names are ever fixed,
 *     this script says so and the translation will have to be adjusted on purpose.
 *
 * It is not in continuous integration: it needs network and the API takes about 40 seconds to wake
 * up. Run it by hand with `npm run check:api`.
 *
 * It also needs **Node 22.6 or newer**, because it runs TypeScript directly with
 * `--experimental-strip-types`. The application itself runs on anything from Node 20.19, which is
 * what `engines` declares; this one script is stricter, and that is worth knowing before running it
 * on the older branch and reading the error as a defect.
 */

import { readFileSync } from 'node:fs';

import { parseProductDetail, parseProductList } from '../src/api/schema.ts';
import type { ProductDetail } from '../src/domain/product.ts';

/**
 * The numbers this project states about the API.
 *
 * They live in a file rather than in prose because a number in a README is checked by nothing:
 * `npm run check:claims` asserts the READMEs quote these, and this script asserts these match the
 * live API. Neither half is any use without the other.
 */
const FACTS = JSON.parse(readFileSync(new URL('api-facts.json', import.meta.url), 'utf8')) as {
  products: number;
  withoutPrice: number;
  withAnyRequiredAttributeEmpty: number;
  withoutNfc: number;
  withBlankOptionName: number;
};

const BASE_URL = process.env['VITE_API_BASE_URL'] ?? 'https://itx-frontend-test.onrender.com';
const CONCURRENCY = 8;

/** The attributes the brief requires to be shown "at least". */
const REQUIRED: readonly (readonly [string, (p: ProductDetail) => string])[] = [
  ['Brand', (p) => p.brand],
  ['Model', (p) => p.model],
  ['Price', (p) => (p.price === null ? '' : String(p.price))],
  ['CPU', (p) => p.specs.cpu.join(' ')],
  ['RAM', (p) => p.specs.ram],
  ['Operating system', (p) => p.specs.operatingSystem.join(' ')],
  ['Screen resolution', (p) => p.specs.screenResolution],
  ['Battery', (p) => p.specs.battery],
  ['Main camera', (p) => p.specs.primaryCamera.join(' ')],
  ['Front camera', (p) => p.specs.secondaryCamera.join(' ')],
  ['Dimensions', (p) => p.specs.dimensions],
  ['Weight', (p) => p.specs.weight],
];

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(new URL(path, `${BASE_URL}/`), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`${path} answered ${String(response.status)}`);
  return response.json();
}

/**
 * Runs the task over the items in batches.
 *
 * Sequential awaiting per batch is the mechanism that limits concurrency against the API. Awaiting
 * every promise at once would fire a hundred simultaneous requests, which is what we want to
 * avoid.
 */
async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    const batch = items.slice(start, start + size);
    results.push(...(await Promise.all(batch.map(task))));
  }
  return results;
}

const errors: string[] = [];
const warnings: string[] = [];

console.log(`Querying ${BASE_URL} (the first request may take ~40 s)…`);

const rawList = await fetchJson('api/product');
const list = parseProductList(rawList);
if (list === undefined) {
  console.error('FAIL: the product list does not pass validation. The API has changed shape.');
  process.exit(1);
}

const rawCount = Array.isArray(rawList) ? rawList.length : 0;
console.log(`List: ${String(rawCount)} products, ${String(list.length)} valid.`);
if (list.length !== rawCount) {
  errors.push(`${String(rawCount - list.length)} products in the list do not pass validation`);
}
for (const product of list) {
  if (product.imageUrl.length === 0) warnings.push(`${product.model}: no usable image`);
}

console.log('Querying the detail of every product…');
const details = await inBatches(list, CONCURRENCY, async (summary) => {
  const raw = await fetchJson(`api/product/${encodeURIComponent(summary.id)}`);
  return { summary, detail: parseProductDetail(raw), raw };
});

const missingAttribute = new Map<string, string[]>();

for (const { summary, detail, raw } of details) {
  if (detail === undefined) {
    errors.push(`${summary.model}: the detail does not pass validation`);
    continue;
  }

  for (const [label, read] of REQUIRED) {
    if (read(detail).length === 0) {
      missingAttribute.set(label, [...(missingAttribute.get(label) ?? []), detail.model]);
    }
  }

  if (detail.options.colors.length === 0 || detail.options.storages.length === 0) {
    errors.push(`${detail.model}: no colours or no capacities, it could not be bought`);
  }

  // The documented quirks of this API. If they stop holding, the API has been corrected and the
  // translation needs revisiting: no longer crossing the fields back, for instance.
  const source = raw as Record<string, unknown>;
  if (!('dimentions' in source)) warnings.push(`${detail.model}: the misspelled field 'dimentions' is gone`);
  if (!('secondaryCmera' in source)) warnings.push(`${detail.model}: 'secondaryCmera' is gone`);
  if (typeof source['displaySize'] === 'string' && !/pixel/i.test(source['displaySize'])) {
    warnings.push(`${detail.model}: 'displaySize' no longer carries pixels; has the swap been undone?`);
  }
}

console.log(`\nProducts queried: ${String(details.length)}`);

// ---------------------------------------------------------------------------
// The stated numbers, asserted rather than printed.
// ---------------------------------------------------------------------------

/** Fails loudly: a number the READMEs state has stopped being true. */
function assertFact(name: string, stated: number, actual: number): void {
  if (stated !== actual) {
    errors.push(
      `the stated ${name} is ${String(stated)} and the API says ${String(actual)} — ` +
        'update scripts/api-facts.json and every README that quotes it',
    );
  }
}

const withAnyEmpty = details.filter(
  ({ detail }) => detail !== undefined && REQUIRED.some(([, read]) => read(detail).length === 0),
).length;
const withoutNfc = details.filter(({ detail }) => detail?.specs.nfc === '').length;
const withBlankOptionName = details.filter(({ detail }) =>
  [...(detail?.options.colors ?? []), ...(detail?.options.storages ?? [])].some(
    (option) => option.name.trim().length === 0,
  ),
).length;

assertFact('number of products', FACTS.products, rawCount);
assertFact('number of products with no price', FACTS.withoutPrice, missingAttribute.get('Price')?.length ?? 0);
assertFact(
  'number of products missing a required attribute',
  FACTS.withAnyRequiredAttributeEmpty,
  withAnyEmpty,
);
assertFact('number of products with no NFC value', FACTS.withoutNfc, withoutNfc);
assertFact('number of products with a blank option name', FACTS.withBlankOptionName, withBlankOptionName);

console.log(
  `Stated numbers: ${String(rawCount)} products, ${String(withAnyEmpty)} missing a required ` +
    `attribute, ${String(withoutNfc)} with no NFC, ${String(withBlankOptionName)} with a blank option name`,
);
console.log('\nRequired attributes with no value in the API (shown as "No disponible"):');
if (missingAttribute.size === 0) {
  console.log('  none');
} else {
  for (const [label, models] of [...missingAttribute].toSorted((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${label}: ${String(models.length)} products (${models.slice(0, 3).join(', ')}…)`);
  }
}

if (warnings.length > 0) {
  console.log(`\n${String(warnings.length)} warning(s):`);
  for (const warning of [...new Set(warnings)].slice(0, 10)) console.log(`  ${warning}`);
}

if (errors.length > 0) {
  console.error(`\n${String(errors.length)} error(s):`);
  for (const error of errors.slice(0, 15)) console.error(`  ${error}`);
  process.exit(1);
}

// The cart lives in a server-side session. Checking it here documents the behaviour the browser
// cannot reproduce across origins, and would catch the API changing its mind about it.
console.log('\nChecking the cart session…');
const cartUrl = new URL('api/cart', `${BASE_URL}/`);
const body = JSON.stringify({ id: list[0]?.id ?? '1', colorCode: 1000, storageCode: 2000 });
const counts: unknown[] = [];
let cookie = '';

for (let attempt = 0; attempt < 3; attempt += 1) {
  const response = await fetch(cartUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body,
    signal: AbortSignal.timeout(90_000),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie !== null) cookie = setCookie.split(';')[0] ?? '';
  counts.push(((await response.json()) as { count?: unknown }).count);
}

console.log(`  counts across three requests on one session: ${counts.join(', ')}`);
if (counts.join(',') !== '1,2,3') {
  warnings.push(
    `the cart session no longer accumulates as expected (got ${counts.join(', ')}); ` +
      'the README explains why the browser cannot use it across origins',
  );
}

if (warnings.length > 0) {
  console.log(`\n${String(warnings.length)} warning(s) about the cart:`);
  for (const warning of [...new Set(warnings)].slice(-3)) console.log(`  ${warning}`);
}

console.log('\nEvery product in the catalogue translates correctly.');
