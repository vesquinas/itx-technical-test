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
 * Translation of errors into HTTP responses.
 *
 * <p>It uses {@link ProblemDetail} (RFC 9457), the error format Spring produces by default and one
 * a client can interpret without ad-hoc agreements.
 *
 * <p>No message carries the original exception or its stack trace. That is not an oversight: error
 * messages are a common leak channel — system paths, internal host names, library versions. The
 * technical detail goes to the server log, where it serves whoever operates the service rather than
 * whoever is calling it.
 *
 * <p>The explicit ordering is necessary, not decorative. Spring Boot registers its own
 * <i>problem details</i> {@code @ControllerAdvice} with order 0, and an advice with no order ends up
 * last: the handlers in this file for exceptions Spring also knows about — {@link
 * NoResourceFoundException}, for instance — would never run. This was found by measuring: without
 * the annotation, an unknown path still answered with Spring's default message.
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ProductNotFoundException.class)
    ProblemDetail handleNotFound(ProductNotFoundException exception) {
        log.debug("Product not found: {}", exception.getMessage());
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "The product does not exist");
    }

    /**
     * Unknown path.
     *
     * <p>Without this handler, Spring answers with the detail {@code "No static resource <path>."},
     * which reveals that there is a static resource server behind and hands the client back the path
     * it sent. Neither of those serves anyone but someone probing the service.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    ProblemDetail handleUnknownPath(NoResourceFoundException exception) {
        log.debug("Unknown path: {}", exception.getMessage());
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Resource not found");
    }

    @ExceptionHandler(ExistingApiUnavailableException.class)
    ProblemDetail handleUpstreamFailure(ExistingApiUnavailableException exception) {
        log.warn("Dependency unavailable: {}", exception.getMessage());
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_GATEWAY, "The product service is unavailable");
    }
}
