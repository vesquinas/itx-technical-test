package com.itx.similarproducts.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

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
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ProductNotFoundException.class)
    ProblemDetail handleNotFound(ProductNotFoundException exception) {
        log.debug("Producto no encontrado: {}", exception.getMessage());
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "El producto no existe");
    }

    @ExceptionHandler(ExistingApiUnavailableException.class)
    ProblemDetail handleUpstreamFailure(ExistingApiUnavailableException exception) {
        log.warn("Dependencia no disponible: {}", exception.getMessage());
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_GATEWAY, "El servicio de productos no está disponible");
    }
}
