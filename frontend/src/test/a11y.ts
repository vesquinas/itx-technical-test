import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Checks an already-rendered view with axe, the accessibility engine behind the usual auditing
 * tools.
 *
 * It exists so that accessibility is a verified fact rather than a README claim. The linter's
 * `jsx-a11y` rules check the static code; axe checks the resulting tree, which is where the real
 * problems show up: missing accessible names, broken heading hierarchies, duplicate identifiers or
 * unlabelled controls.
 *
 * `color-contrast` is disabled because jsdom computes neither styles nor geometry, so the rule
 * cannot be evaluated and would only produce noise. Contrast was chosen by hand in the design
 * system.
 */
export async function expectNoAccessibilityViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });

  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'no impact'}): ${violation.help} — ` +
      violation.nodes.map((node) => node.html).join(' | '),
  );

  expect(summary).toEqual([]);
}
