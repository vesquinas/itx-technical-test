import { useId } from 'react';

import type { ProductOption } from '../domain/product.ts';
import styles from './OptionPicker.module.css';

/** Label for an option the API gives no name for. */
const FALLBACK_LABEL = 'Estándar';

/**
 * A picker for one option among several.
 *
 * A group of radios in a `fieldset` with a `legend`, rather than buttons or a `<select>`: it is the
 * element that matches a mutually exclusive choice, so the screen reader announces "Color, group,
 * option 1 of 2", and the arrow keys work without writing any keyboard handling. The radios are
 * hidden visually and the label carries the appearance, which keeps the native behaviour under the
 * wireframe's design.
 *
 * An option with no name gets a filler label. Two products of the catalogue deliver their only
 * storage option with a space for a name, and dropping it left them unbuyable — the code is valid
 * and the API accepts the purchase.
 */
export function OptionPicker({
  legend,
  options,
  selectedCode,
  onSelect,
  disabled = false,
}: {
  legend: string;
  options: readonly ProductOption[];
  selectedCode: number | undefined;
  onSelect: (code: number) => void;
  /** Locks the group while an action is under way. */
  disabled?: boolean;
}) {
  const groupName = useId();

  return (
    // `disabled` on the `fieldset` locks the whole group at once, which is what the native element
    // does: there is no need to propagate it to every radio.
    <fieldset className={styles.group} disabled={disabled}>
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
                {option.name.length > 0 ? option.name : FALLBACK_LABEL}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
