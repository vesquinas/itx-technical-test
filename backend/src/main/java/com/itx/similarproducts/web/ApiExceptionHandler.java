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
 * <p>No message carries the exception, its stack trace, or anything the caller sent: errors are a
 * common leak channel — system paths, host names, library versions — and a response that repeats
 * the request is the channel the serious ones travel through. The technical detail goes to the log.
 * See {@link ProblemDetailInstances} for the {@code instance} field and the 405 below for the
 * method name; {@code ErrorResponsesTest} checks every error at once rather than field by field.
 *
 * <p>The explicit ordering is necessary, not decorative. Spring Boot registers its own
 * <i>problem details</i> advice with order 0, and an advice with no order ends up last, so the
 * handlers here for exceptions Spring also knows — {@link NoResourceFoundException} — would never
 * run.
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
     * Unknown path. Spring's own detail is {@code "No static resource <path>."}, which announces
     * that there is a static resource server behind and repeats the path back.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    ProblemDetail handleUnknownPath(NoResourceFoundException exception) {
        log.debug("Unknown path: {}", exception.getMessage());
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Resource not found");
    }

    /**
     * The route exists but not for this method. Handled here only to drop Spring's wording,
     * {@code "Method 'X' is not supported."}, which repeats back a string the caller chooses. The
     * {@code Allow} header stays: that part of a 405 is ours, and HTTP requires it.
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
