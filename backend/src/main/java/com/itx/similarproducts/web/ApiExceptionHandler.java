package com.itx.similarproducts.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import java.util.Set;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpRequestMethodNotSupportedException;
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
 * <p>Nothing the caller sent is repeated back either, which took a review to actually achieve: see
 * {@link ProblemDetailInstances} for the {@code instance} field, and the 405 below for the method
 * name. {@code ErrorResponsesTest} checks the whole set of errors at once rather than field by
 * field, because a leak moved to a different field is the failure mode a per-field test misses.
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

    /**
     * The route exists but not for this method.
     *
     * <p>Handled here only to drop Spring's wording, {@code "Method 'X' is not supported."}, which
     * repeats back the method the caller sent — one more piece of the request in the response, and
     * one an attacker chooses freely.
     *
     * <p>The {@code Allow} header stays, because that is the part of a 405 that belongs to us: it
     * says what the endpoint accepts, and the HTTP specification requires it.
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ProblemDetail> handleWrongMethod(HttpRequestMethodNotSupportedException exception) {
        log.debug("Method not allowed: {}", exception.getMessage());

        HttpHeaders headers = new HttpHeaders();
        HttpMethod[] allowed = exception.getSupportedHttpMethods() == null
                ? new HttpMethod[0]
                : exception.getSupportedHttpMethods().toArray(HttpMethod[]::new);
        headers.setAllow(Set.of(allowed));

        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .headers(headers)
                .body(ProblemDetail.forStatusAndDetail(
                        HttpStatus.METHOD_NOT_ALLOWED, "Method not allowed"));
    }

    @ExceptionHandler(ExistingApiUnavailableException.class)
    ProblemDetail handleUpstreamFailure(ExistingApiUnavailableException exception) {
        log.warn("Dependency unavailable: {}", exception.getMessage());
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_GATEWAY, "The product service is unavailable");
    }
}
