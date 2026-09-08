import { useId } from 'react';

import type { ProductOption } from '../domain/product.ts';
import styles from './OptionPicker.module.css';

/**
 * Selector de una opcion entre varias.
 *
 * Se implementa como un grupo de radios dentro de un `fieldset` con `legend`, no
 * como una lista de botones ni como un `<select>`:
 *
 * - Es el elemento que corresponde a una eleccion excluyente, y el lector de
 *   pantalla anuncia "Color, grupo, opcion 1 de 2" en lugar de leer dos botones
 *   sueltos sin relacion.
 * - El teclado funciona sin escribir nada: las flechas se mueven dentro del
 *   grupo y el tabulador salta al siguiente grupo, que es lo que espera quien
 *   navega asi.
 *
 * Los radios nativos van ocultos visualmente y el aspecto lo da la etiqueta, de
 * modo que se conserva todo el comportamiento nativo con el diseno del wireframe.
 */
export function OptionPicker({
  legend,
  options,
  selectedCode,
  onSelect,
}: {
  legend: string;
  options: readonly ProductOption[];
  selectedCode: number | undefined;
  onSelect: (code: number) => void;
}) {
  const groupName = useId();

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>

      <div className={styles.options}>
        {options.map((option) => {
          const inputId = `${groupName}-${String(option.code)}`;
          return (
            <div className={styles.option} key={option.code}>
              <input
                checked={selectedCode === option.code}
                className={styles.input}
                id={inputId}
                name={groupName}
                onChange={() => {
                  onSelect(option.code);
                }}
                type="radio"
                value={option.code}
              />
              <label className={styles.chip} htmlFor={inputId}>
                {option.name}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
