import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Read as text on purpose. What matters here is what the stylesheet *says*: importing it as a
// stylesheet would hand back the CSS-modules class map, and loading it in jsdom would achieve
// nothing, since jsdom does not lay anything out.
function read(stylesheet: string): string {
  return readFileSync(new URL(stylesheet, import.meta.url), 'utf8');
}

/** The ladder the brief asks for: one column on a phone, up to four on a wide screen. */
const EXPECTED_LADDER = ['from 0: 1', 'from 30rem: 2', 'from 48rem: 3', 'from 64rem: 4'];

/**
 * Every declaration of the grid's columns, in the order the stylesheet declares them, each tagged
 * with the width it applies from.
 */
function ladderOf(css: string): string[] {
  const ladder: string[] = [];
  let appliesFrom = '0';

  for (const line of css.split('\n')) {
    const breakpoint = /@media \(min-width:\s*([^)]+)\)/.exec(line);
    if (breakpoint?.[1] !== undefined) {
      appliesFrom = breakpoint[1].trim();
    }

    const columns = /grid-template-columns:\s*(?:repeat\((\d+),\s*1fr\)|(1fr))\s*;/.exec(line);
    if (columns !== null) {
      ladder.push(`from ${appliesFrom}: ${columns[1] ?? '1'}`);
    }
  }
  return ladder;
}

/**
 * The number of columns in the catalogue grid, which the brief states as a number.
 *
 * This test reads the stylesheet rather than rendering anything, and that deserves an explanation
 * because it is not how the rest of the suite works.
 *
 * The requirement — up to four products per row — lives only in a media query. jsdom parses CSS but
 * does not lay anything out and does not apply media queries, so `getComputedStyle` on a rendered
 * grid returns nothing useful: a rendering test cannot see this. Proving that a browser really
 * places four cards per row at 64rem needs a real browser, and that is listed among the things left
 * undone.
 *
 * What can be checked without one is that the stylesheet still declares what the brief asks. That
 * is worth doing, because changing `repeat(4, 1fr)` to `repeat(6, 1fr)` was one of three mutations
 * an external review found the suite blind to — and all three were the same kind: the requirements
 * the brief states as a literal number. Behaviour was covered; arithmetic was not.
 *
 * It also checks something a rendering test could not: that the **skeleton** uses the same ladder as
 * the real grid. They are two files that have to agree, and when they do not the layout jumps as
 * soon as the data arrives.
 */
describe('the columns of the catalogue grid', () => {
  it('goes up to four columns and no further', () => {
    expect(ladderOf(read('./ProductGrid.module.css'))).toEqual(EXPECTED_LADDER);
  });

  it('gives the loading skeleton the very same ladder, so the layout does not jump', () => {
    expect(ladderOf(read('./ProductGridSkeleton.module.css'))).toEqual(EXPECTED_LADDER);
  });
});
