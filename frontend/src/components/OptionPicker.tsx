import { useId } from 'react';

import type { ProductOption } from '../domain/product.ts';
import styles from './OptionPicker.module.css';

/** Label for an option the API gives no name for. */
const FALLBACK_LABEL = 'Estándar';

/**
 * A picker for one option among several.
 *
 * It is built as a group of radios inside a `fieldset` with a `legend`, not as a list of buttons
 * and not as a `<select>`:
 *
 * - It is the element that matches a mutually exclusive choice, and the screen reader announces
 *   "Color, group, option 1 of 2" instead of reading two unrelated buttons.
 * - The keyboard works without writing anything: the arrow keys move within the group and Tab
 *   jumps to the next group, which is what anyone navigating that way expects.
 *
 * The native radios are hidden visually and the appearance comes from the label, so all the native
 * behaviour is preserved alongside the wireframe's design.
 *
 * When the API gives no name for an option, a filler label is used. That happens in two products of
 * the catalogue, whose only storage option arrives with a space for a name. The alternative —
 * dropping the option — left those products unable to be bought, which is worse: the option's code
 * is valid and the API accepts the purchase.
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
