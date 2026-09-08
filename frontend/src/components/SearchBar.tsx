import { useId } from 'react';

import styles from './SearchBar.module.css';

/**
 * The search field of the product list.
 *
 * Filtering is real time: every keystroke updates the value and the view filters again. No delay
 * is applied to the filtering because the products are already in memory and filtering them is
 * immediate; delaying it would only introduce artificial latency. The delay applies solely to
 * writing the term into the URL, which is what is better not redone on every key.
 *
 * `useId` generates the identifier that ties the label to the field, rather than a constant: if
 * there were ever two search fields on the same page, the `id`s would still be unique.
 */
export function SearchBar({
  value,
  onChange,
  resultsLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Summary of the result, announced to the screen reader. */
  resultsLabel: string;
}) {
  const inputId = useId();
  const statusId = useId();

  return (
    <div className={styles.search}>
      <label className={styles.label} htmlFor={inputId}>
        Buscar
      </label>

      <div className={styles.field}>
        <input
          aria-describedby={statusId}
          autoComplete="off"
          className={styles.input}
          id={inputId}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          placeholder="Marca o modelo"
          // `search` rather than `text`: on mobile the keyboard shows the search key and the
          // browser offers a clear button.
          type="search"
          value={value}
        />
        {value.length > 0 ? (
          <button
            className={styles.clear}
            onClick={() => {
              onChange('');
            }}
            type="button"
          >
            <span className="visually-hidden">Borrar la búsqueda</span>
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>

      {/*
        `aria-live="polite"` announces how many results are left as the user types. Without it,
        someone using a screen reader has no way of noticing the list below has changed.
      */}
      <p aria-live="polite" className={styles.status} id={statusId}>
        {resultsLabel}
      </p>
    </div>
  );
}
