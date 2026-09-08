package com.itx.similarproducts.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * The last resort: anything that was not anticipated.
 *
 * <p>Without it, an unexpected exception falls through to Spring Boot's error dispatch, which
 * answers a different shape from every other error of this service and includes the request path:
 * {@code {"timestamp":…,"status":500,"error":"Internal Server Error","path":"/product/…/similar"}}.
 * So the one failure nobody designed was also the one that described itself the most.
 *
 * <p>It answers the same {@link ProblemDetail} as the rest, with nothing in it: the caller can do
 * nothing with the reason, and whoever can — us — reads it in the log, where the exception is
 * recorded whole, with its stack trace, at {@code error} level. That asymmetry is the whole point of
 * the class.
 *
 * <p><b>It sits at the lowest precedence, and that is what makes it safe.</b> An advice that handles
 * {@code Exception} at high precedence swallows everything: a failed validation would come out as a
 * 500 instead of a 400, because its exception is also an {@code Exception}. Running last means it
 * only sees what no other handler wanted.
 */
@Order(Ordered.LOWEST_PRECEDENCE)
@RestControllerAdvice
public class UnexpectedErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(UnexpectedErrorHandler.class);

    @ExceptionHandler(Exception.class)
    ProblemDetail handleAnythingElse(Exception exception) {
        // At error level and with the exception attached: this is a bug in the service, and the only
        // error path here that deserves the full stack trace in the log.
        log.error("Unexpected failure serving a request", exception);
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected error");
    }
}
