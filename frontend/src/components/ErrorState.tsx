import type { ApiError } from '../api/client.ts';
import styles from './ErrorState.module.css';

/**
 * Translates a technical failure into a message that is useful to a person.
 *
 * The cases are told apart because the action the user can take differs in each: a network problem
 * can be retried, whereas offering a retry for a product that does not exist makes no sense.
 */
function describe(error: ApiError): { title: string; detail: string; canRetry: boolean } {
  switch (error.kind) {
    case 'notFound':
      return {
        title: 'No hemos encontrado este producto',
        detail: 'Puede que ya no esté disponible o que el enlace no sea correcto.',
        canRetry: false,
      };
    case 'timeout':
      return {
        title: 'La consulta ha tardado demasiado',
        detail:
          'El servidor de la prueba se apaga cuando no recibe visitas y puede tardar cerca de un minuto en arrancar. Vuelve a intentarlo.',
        canRetry: true,
      };
    case 'network':
      return {
        title: 'No hemos podido conectar',
        detail: 'Comprueba tu conexión a internet y vuelve a intentarlo.',
        canRetry: true,
      };
    case 'malformed':
      return {
        title: 'La respuesta no es la esperada',
        detail: 'El servidor ha contestado con datos que no hemos podido interpretar.',
        canRetry: true,
      };
    case 'http':
    case 'aborted':
      return {
        title: 'Algo ha ido mal',
        detail: 'El servidor no ha podido atender la petición. Vuelve a intentarlo.',
        canRetry: true,
      };
  }
}

/**
 * Error block with a retry.
 *
 * The retry is explicit and not automatic on purpose: retrying in a loop punishes a server that is
 * already in trouble, and leaves the user unsure whether the application is doing something or has
 * hung.
 *
 * `role="alert"` makes the screen reader announce it as soon as it appears, without waiting for the
 * user to navigate down to it.
 */
export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const { title, detail, canRetry } = describe(error);

  return (
    <div className={styles.block} role="alert">
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.detail}>{detail}</p>
      {canRetry && onRetry !== undefined ? (
        <button className={styles.retry} onClick={onRetry} type="button">
          Volver a intentarlo
        </button>
      ) : null}
    </div>
  );
}
