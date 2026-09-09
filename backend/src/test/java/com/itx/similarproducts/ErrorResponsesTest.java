package com.itx.similarproducts;

import java.net.URI;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What an error response is allowed to contain.
 *
 * <p>The assertion is deliberately blunt: send a long, recognisable marker and require that
 * <b>no part of it comes back</b>, over every error the service can produce. A test that names the
 * field it checks — the previous one asserted {@code doesNotContain("static resource")} — is
 * satisfied by moving the leak to another field, which is exactly what had happened.
 *
 * <p>The risk is modest: about 1:1 amplification and no secret in a path the caller wrote. The
 * habit is not, since a response that repeats the request is how the serious leaks travel.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ErrorResponsesTest {

    /** Long enough that a truncated echo still shows up, and unmistakable in a response body. */
    private static final String MARKER = "REFLEJAME".repeat(200);

    @Autowired
    private TestRestTemplate restTemplate;

    @LocalServerPort
    private int port;

    private static Stream<Arguments> everyErrorTheServiceCanProduce() {
        return Stream.of(
                // Too long: rejected by the size limit on the identifier.
                Arguments.of("400 on an oversized identifier",
                        HttpMethod.GET, "/product/" + MARKER + "/similar"),
                // Well-formed but unknown: the source answers 404.
                Arguments.of("404 on a product that does not exist",
                        HttpMethod.GET, "/product/no-" + MARKER.substring(0, 100) + "/similar"),
                // No route matches.
                Arguments.of("404 on an unknown path",
                        HttpMethod.GET, "/" + MARKER),
                // The route matches but the method does not.
                Arguments.of("405 on a method that is not allowed",
                        HttpMethod.POST, "/product/" + MARKER.substring(0, 100) + "/similar"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("everyErrorTheServiceCanProduce")
    void no_error_response_hands_back_what_the_caller_sent(String name, HttpMethod method, String path) {
        ResponseEntity<String> response =
                restTemplate.exchange(path, method, null, String.class);

        assertThat(response.getStatusCode().isError())
                .as("the request should have failed, otherwise this proves nothing")
                .isTrue();
        assertThat(response.getBody())
                .as("no fragment of what the caller sent may come back")
                .doesNotContain("REFLEJAME");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("everyErrorTheServiceCanProduce")
    void an_error_response_is_bounded_in_size(String name, HttpMethod method, String path) {
        ResponseEntity<String> response =
                restTemplate.exchange(path, method, null, String.class);

        // A fixed body cannot be used to amplify: whatever the request weighs, the answer does not
        // grow with it.
        assertThat(response.getBody()).hasSizeLessThan(300);
    }

    @Test
    void the_one_response_that_escapes_the_format_still_gives_nothing_away() {
        // A path with an encoded slash never reaches Spring: Tomcat rejects it first and answers
        // its own page, which is the single response of this service that is not
        // application/problem+json. The README says so, and says it leaks nothing — a claim that
        // until now nothing checked. Sent as an absolute URI so the %2F survives: a path template
        // would be encoded again and the case would not be reproduced.
        ResponseEntity<String> response = restTemplate.exchange(
                URI.create("http://localhost:" + port + "/product/a%2Fb/similar"),
                HttpMethod.GET,
                null,
                String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getHeaders().getContentType())
                .as("the container answers, so this one is HTML")
                .isNotNull();
        assertThat(response.getHeaders().getContentType().toString()).startsWith("text/html");

        // What the README claims about it: small, and empty of anything worth having.
        assertThat(response.getBody()).hasSizeLessThan(600);
        assertThat(response.getBody())
                .doesNotContain("a%2Fb", "a/b")
                .doesNotContainIgnoringCase("tomcat")
                .doesNotContainIgnoringCase("apache")
                .doesNotContain("com.itx", "Exception");
    }

    @Test
    void no_response_announces_the_server_it_runs_on() {
        ResponseEntity<String> response =
                restTemplate.getForEntity("/product/{id}/similar", String.class, "cualquiera");

        // The `server.server-header: ""` setting is, measured, a no-op today: Spring Boot sends no
        // Server header with Tomcat anyway. This test is what actually holds the claim — including
        // the day someone swaps the container for one that does announce itself.
        assertThat(response.getHeaders().getFirst("Server")).isNull();
    }

    @Test
    void the_method_that_is_not_allowed_is_not_repeated_back_either() {
        ResponseEntity<String> response = restTemplate.exchange(
                "/product/1/similar", HttpMethod.valueOf("PROPFIND"), null, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        // Spring's default wording is "Method 'PROPFIND' is not supported.", which is one more
        // piece of the request coming back.
        assertThat(response.getBody()).doesNotContain("PROPFIND");
        // The header that does belong in a 405 is still there: it says what the endpoint accepts,
        // which is our information and not the caller's.
        assertThat(response.getHeaders().getFirst("Allow")).contains("GET");
    }
}
