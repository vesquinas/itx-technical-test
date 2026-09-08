import { useId } from 'react';

import styles from './SearchBar.module.css';

/**
 * Campo de búsqueda del listado.
 *
 * El filtrado es en tiempo real: cada pulsación de tecla actualiza el valor y la
 * vista vuelve a filtrar. No se aplica retardo al filtrado porque los productos
 * ya están en memoria y filtrarlos es inmediato; retrasarlo solo introduciria una
 * latencia artificial. El retardo se aplica únicamente a la escritura del termino
 * en la URL, que es lo que no conviene rehacer en cada tecla.
 *
 * `useId` genera el identificador que une etiqueta y campo, en lugar de una
 * constante: si algun dia hubiera dos buscadores en la misma página, los `id`
 * seguirían siendo únicos.
 */
export function SearchBar({
  value,
  onChange,
  resultsLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Resumen del resultado, que se anuncia al lector de pantalla. */
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
          // `search` en lugar de `text`: en movil el teclado muestra la tecla de
          // búsqueda y el navegador ofrece el boton de borrado.
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
        `aria-live="polite"` anuncia cuantos resultados quedan a medida que se
        escribe. Sin esto, quien usa lector de pantalla no percibe que la lista
        de abajo ha cambiado.
      */}
      <p aria-live="polite" className={styles.status} id={statusId}>
        {resultsLabel}
      </p>
    </div>
  );
}
