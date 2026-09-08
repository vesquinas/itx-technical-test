import type { ApiError } from '../api/client.ts';
import styles from './ErrorState.module.css';

/**
 * Traduce un fallo tecnico a un mensaje que le sirva a una persona.
 *
 * Se distingue por tipo de fallo porque la acción que puede tomar el usuario es
 * distinta en cada caso: ante un problema de red puede reintentar, ante un
 * producto inexistente no tiene sentido ofrecerlo.
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
 * Bloque de error con reintento.
 *
 * El reintento es explicito y no automático a propósito: un reintento en bucle
 * castiga a un servidor que ya está en problemas, y deja al usuario sin saber
 * si la aplicación está haciendo algo o se ha quedado colgada.
 *
 * `role="alert"` hace que el lector de pantalla lo anuncie en cuanto aparece,
 * sin esperar a que el usuario llegue navegando hasta el.
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
