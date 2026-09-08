/**
 * Verifies that the Content-Security-Policy of the built HTML covers everything the page actually
 * loads.
 *
 * It exists because a badly tuned CSP does not warn: the browser blocks the resource silently, and
 * the application breaks in production and not in development, where the policy is not even
 * applied. This script closes that gap without needing a browser, by checking four things against
 * the real result of the build:
 *
 *   1. That the policy exists and carries the directives we expect.
 *   2. That there is not a single inline script or style, which is the only thing that justifies
 *      being able to do without `unsafe-inline`.
 *   3. That everything the page references is same-origin.
 *   4. That the API origin is allowed both for connections and for images.
 *
 * It runs in continuous integration, after the build.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const DEFAULT_API_BASE_URL = 'https://itx-frontend-test.onrender.com';

/**
 * The origin the policy has to allow.
 *
 * `VITE_API_BASE_URL` may be relative — that is how a deployment sitting behind a reverse proxy
 * configures it, so the requests are same-origin and the API's session cookie works. A relative
 * value says nothing about where the API lives, so the default applies, exactly as in
 * vite.config.ts. Feeding it straight to `new URL` is what this script used to do, and it crashed
 * on precisely the configuration a real deployment would use.
 */
function apiOriginToAllow() {
  const configured = process.env['VITE_API_BASE_URL'];
  const absolute =
    configured !== undefined && /^https?:\/\//i.test(configured)
      ? configured
      : DEFAULT_API_BASE_URL;
  return new URL(absolute).origin;
}

const problems = [];
const passed = [];

function check(description, condition, detail = '') {
  if (condition) {
    passed.push(description);
  } else {
    problems.push(`${description}${detail ? ` — ${detail}` : ''}`);
  }
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// 1. The policy exists and can be read.
const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html);
check('the built HTML declares a Content-Security-Policy', meta !== null);

if (meta !== null) {
  const policy = meta[1].replaceAll('&#39;', "'").replaceAll('&amp;', '&');
  const directives = new Map(
    policy
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values];
      }),
  );

  for (const expected of [
    'default-src',
    'script-src',
    'style-src',
    'img-src',
    'connect-src',
    'object-src',
    'base-uri',
    'form-action',
  ]) {
    check(`the policy declares ${expected}`, directives.has(expected));
  }

  check(
    "script-src does not allow 'unsafe-inline'",
    !(directives.get('script-src') ?? []).includes("'unsafe-inline'"),
  );
  check(
    "style-src does not allow 'unsafe-inline'",
    !(directives.get('style-src') ?? []).includes("'unsafe-inline'"),
  );

  // 4. The API origin has to be allowed, or the application loads no data at all.
  const apiOrigin = apiOriginToAllow();
  for (const directive of ['connect-src', 'img-src']) {
    check(
      `${directive} allows the API origin (${apiOrigin})`,
      (directives.get(directive) ?? []).includes(apiOrigin),
    );
  }
}

// 2. Nothing inline. That is the condition that allows doing without `unsafe-inline`.
const inlineScripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);
check('there are no inline scripts', inlineScripts.length === 0, `${inlineScripts.length} found`);

const inlineStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);
check('there are no inline styles', inlineStyles.length === 0, `${inlineStyles.length} found`);

check('no element uses the style attribute', !/\sstyle="/i.test(html));

// 3. What the document references is same-origin or an allowed origin.
//
// The API origin does appear, in the `preconnect` and `dns-prefetch` tags, and that is correct:
// they are connection hints, not resource loads, and that origin is allowed by the policy. What we
// are looking for here is a third origin that slipped in undeclared.
const allowedApiOrigin = apiOriginToAllow();
const references = [...html.matchAll(/\s(?:src|href)="([^"]+)"/gi)].map((match) => match[1]);
const undeclaredExternal = references.filter((reference) => {
  if (!/^[a-z]+:/i.test(reference) || reference.startsWith('data:')) return false;
  try {
    return new URL(reference).origin !== allowedApiOrigin;
  } catch {
    return true;
  }
});
check(
  'the document references no origin undeclared in the policy',
  undeclaredExternal.length === 0,
  undeclaredExternal.join(', '),
);

// And the same for the built stylesheets: an external `url()` would be blocked by img-src.
const assets = join(DIST, 'assets');
const externalCssUrls = readdirSync(assets)
  .filter((name) => name.endsWith('.css'))
  .flatMap((name) =>
    [...readFileSync(join(assets, name), 'utf8').matchAll(/url\(\s*['"]?([^'")]+)/gi)]
      .map((match) => match[1])
      .filter((reference) => /^[a-z]+:\/\//i.test(reference)),
  );
check(
  'the built CSS loads no cross-origin resources',
  externalCssUrls.length === 0,
  externalCssUrls.join(', '),
);

for (const description of passed) {
  console.log(`  ok  ${description}`);
}
for (const problem of problems) {
  console.error(`  FAIL  ${problem}`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} CSP check(s) failed.`);
  process.exit(1);
}
console.log(`\n${passed.length} CSP checks passed.`);
