import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The two layout requirements the brief states as structure, checked against the stylesheets.
 *
 * They are here because jsdom applies no CSS: it parses stylesheets but lays nothing out, so a
 * rendering test cannot see a column, a row or a side. What it can see is the order of the DOM,
 * and the two halves only mean something together — being the last element of a row is "on the
 * right" *if* the row is a row.
 *
 * Both used to be cited in the README's compliance table by tests that proved something adjacent:
 * two columns by a test of the order of two elements inside the second column, and the cart's
 * position by a test that the word "Cesta" appeared on a page. A review read the bodies. The
 * technique used here is the one already used for the catalogue's four columns.
 */
function stylesheet(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

/** The declarations of one class, in source order. */
function rulesFor(css: string, className: string): string[] {
  return [...css.matchAll(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`, 'g'))].map((match) =>
    (match[1] ?? '').replaceAll(/\s+/g, ' ').trim(),
  );
}

describe('the detail page is laid out in two columns', () => {
  const css = stylesheet('./ProductDetailPage.module.css');

  it('declares one column on a narrow screen and two from 48rem', () => {
    const layout = rulesFor(css, 'layout');

    expect(layout[0]).toContain('grid-template-columns: 1fr');
    // Two tracks, the first for the image and the second for the details and the actions.
    expect(layout.at(-1)).toMatch(/grid-template-columns: minmax\([^)]+\) minmax\([^)]+\)/);
  });

  it('applies the second column from the breakpoint the design uses', () => {
    const breakpoints = [...css.matchAll(/@media \(min-width: ([^)]+)\)\s*\{\s*\.layout/g)].map(
      (match) => match[1],
    );

    expect(breakpoints).toEqual(['48rem']);
  });
});

describe('the header is a row, so its last element is the one on the right', () => {
  const css = stylesheet('../components/Header.module.css');

  it('lays the header out as a flex row', () => {
    expect(rulesFor(css, 'inner')[0]).toContain('display: flex');
  });
});
