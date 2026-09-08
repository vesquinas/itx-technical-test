import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Comprueba una vista ya renderizada con axe, el motor de accesibilidad que usan
 * las herramientas de auditoría habituales.
 *
 * Existe para que la accesibilidad sea un hecho verificado y no una afirmación del
 * README. Las reglas de `jsx-a11y` del linter revisan el código estático; axe
 * revisa el árbol resultante, que es donde aparecen los problemas de verdad:
 * nombres accesibles ausentes, jerarquías de encabezado roscadas, identificadores
 * duplicados o controles sin etiqueta.
 *
 * Se desactiva `color-contrast` porque jsdom no calcula estilos ni geometría, de
 * modo que la regla no puede evaluarse y solo produciría ruido. El contraste se
 * eligió a mano en el sistema de diseño.
 */
export async function expectNoAccessibilityViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });

  const resumen = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'sin impacto'}): ${violation.help} — ` +
      violation.nodes.map((node) => node.html).join(' | '),
  );

  expect(resumen).toEqual([]);
}
