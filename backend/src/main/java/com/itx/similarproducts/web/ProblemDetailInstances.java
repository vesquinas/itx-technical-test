package com.itx.similarproducts.web;

import java.net.URI;

import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * Keeps the request path out of the {@code instance} field of every error response.
 *
 * <p>Spring fills {@code instance} with the URI of the request when the handler leaves it empty,
 * which hands the caller back the path it sent. A 2,000-character identifier produced a 2,000
 * character error response — found in review, after a README had claimed the opposite.
 *
 * <p>The risk on its own is modest: the amplification is about 1:1 and there is no secret in a path
 * the caller wrote. It is worth closing anyway for two reasons. A response that repeats the request
 * is the channel through which the serious leaks travel — internal paths, host names, library
 * versions — so the habit matters more than this instance of it. And a client gains nothing from
 * being told the path it just used.
 *
 * <p>What replaces it is the <b>route template</b> — {@code /product/{productId}/similar} — which
 * says which endpoint produced the problem, is written by us rather than by the caller, and has a
 * fixed length. When no route matched there is no endpoint to name, and the field falls back to
 * {@code about:blank}: the same "nothing further to say" marker RFC 9457 defines for {@code type},
 * which these responses already carry.
 *
 * <p>It is done <b>here</b>, on the way out, and not in each handler on purpose. Some of these
 * responses are not ours: the 400 of a failed validation and the 405 of a wrong method are built by
 * Spring's own advice. A fix applied handler by handler would cover the ones we remembered, which is
 * exactly how this leak survived the first time.
 */
@ControllerAdvice
public class ProblemDetailInstances implements ResponseBodyAdvice<Object> {

    private static final URI NO_ENDPOINT = URI.create("about:blank");

    /** What Spring reports as the matched pattern when the request fell through to no endpoint. */
    private static final String CATCH_ALL = "/**";

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        // Every body passes through: the type is only known at runtime, because the same advice has
        // to cover the responses this application writes and the ones Spring writes.
        return true;
    }

    @Override
    public Object beforeBodyWrite(
            Object body,
            MethodParameter returnType,
            MediaType selectedContentType,
            Class<? extends HttpMessageConverter<?>> selectedConverterType,
            ServerHttpRequest request,
            ServerHttpResponse response) {

        if (body instanceof ProblemDetail problem) {
            problem.setInstance(endpointOf(request));
        }
        return body;
    }

    private static URI endpointOf(ServerHttpRequest request) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            return NO_ENDPOINT;
        }

        Object pattern = servletRequest.getServletRequest()
                .getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);

        if (!(pattern instanceof String template) || template.isBlank() || CATCH_ALL.equals(template)) {
            return NO_ENDPOINT;
        }
        // The template comes from the annotations in this codebase, so it needs no sanitising and
        // cannot grow with the request. It is not built as a URI with `URI.create` on user input:
        // the braces of a template are not valid in a URI, hence the encoded form.
        return URI.create(template.replace("{", "%7B").replace("}", "%7D"));
    }
}
