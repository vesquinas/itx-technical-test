package com.itx.similarproducts.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.itx.similarproducts.catalog.ExistingApiUnavailableException;
import com.itx.similarproducts.catalog.ProductNotFoundException;

/**
 * Traducción de errores a respuestas HTTP.
 *
 * <p>Se usa {@link ProblemDetail} (RFC 9457), que es el formato de error que Spring produce por
 * omisión y que un cliente puede interpretar sin acuerdos ad hoc.
 *
 * <p>Ningún mensaje incluye la excepción original ni su traza. No es descuido: los mensajes de
 * error son una vía habitual de filtración: rutas del sistema, nombres de host internos o
 * versiones de librerías. El detalle técnico va al registro del servidor, donde le sirve a quien
 * opera el servicio y no a quien llama.
 *
 * <p>El orden explícito es necesario, no decorativo. Spring Boot registra su propio
 * {@code @ControllerAdvice} de <i>problem details</i> con orden 0, y un advice sin orden queda en
 * la última posición: los manejadores de este fichero para excepciones que Spring también conoce
 * —{@link NoResourceFoundException}, por ejemplo— nunca llegarían a ejecutarse. Se comprobó
 * midiendo: sin esta anotación, una ruta desconocida seguía respondiendo con el mensaje por
 * omisión de Spring.
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ProductNotFoundException.class)
    ProblemDetail handleNotFound(ProductNotFoundException exception) {
        log.debug("Producto no encontrado: {}", exception.getMessage());
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "El producto no existe");
    }

    /**
     * Ruta desconocida.
     *
     * <p>Sin este manejador, Spring responde con el detalle {@code "No static resource <ruta>."},
     * que revela que detrás hay un servidor de recursos estáticos y devuelve al cliente la ruta
     * que él mismo envió. Ninguna de las dos cosas le sirve a nadie más que a quien está
     * explorando el servicio.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    ProblemDetail handleUnknownPath(NoResourceFoundException exception) {
        log.debug("Ruta desconocida: {}", exception.getMessage());
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Recurso no encontrado");
    }

    @ExceptionHandler(ExistingApiUnavailableException.class)
    ProblemDetail handleUpstreamFailure(ExistingApiUnavailableException exception) {
        log.warn("Dependencia no disponible: {}", exception.getMessage());
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_GATEWAY, "El servicio de productos no está disponible");
    }
}
