package com.itx.similarproducts;

import java.time.Duration;
import java.util.Date;
import java.util.List;

import com.github.tomakehurst.wiremock.client.WireMock;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import com.github.tomakehurst.wiremock.verification.LoggedRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.itx.similarproducts.domain.ProductDetail;
import com.itx.similarproducts.service.SimilarProductsService;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlMatching;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Behaviour of the service against a slow or downed existing API.
 *
 * <p>The timeouts are cut down so the tests run fast; in production they are seconds. What is being
 * checked is the behaviour, not the values.
 *
 * <p><b>They were cut down too far.</b> With a 400 ms read timeout, the very first HTTP call of the
 * class had to fit a cold JVM, a fresh connection and WireMock's own first request into 400 ms —
 * and on a clean clone, where everything is being compiled and warmed at once, it did not: the
 * suite failed with the source reported as unavailable. The parallel test had the same problem from
 * the other side, three 300 ms calls inside a 600 ms budget.
 *
 * <p>The read timeout is now generous, which is what that failure was about, and the budget stays
 * small so the class stays fast. What changed in the parallel test is better than a bigger margin:
 * it no longer infers parallelism from the total time. It measures it — the three calls to the
 * source have to be <b>dispatched together</b>, which is what "in parallel" means and what serial
 * execution cannot fake. A timing test with no margin does not test timing; it tests whether the
 * machine was busy.
 */
@SpringBootTest(properties = {
        "existing-api.read-timeout=2s",
        "existing-api.fan-out-timeout=600ms",
        "existing-api.unavailable-ttl=2s",
        "existing-api.max-similar-products=3"
})
class SimilarProductsResilienceTest {

    @RegisterExtension
    static WireMockExtension existingApi = WireMockExtension.newInstance()
            .options(wireMockConfig().dynamicPort())
            .build();

    @DynamicPropertySource
    static void existingApiProperties(DynamicPropertyRegistry registry) {
        registry.add("existing-api.base-url", existingApi::baseUrl);
    }

    @Autowired
    private SimilarProductsService service;

    private static void stubSimilarIds(String productId, String body) {
        existingApi.stubFor(get(urlEqualTo("/product/" + productId + "/similarids"))
                .willReturn(aResponse().withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withBody(body)));
    }

    private static void stubProduct(String productId, String name, int delayMillis) {
        existingApi.stubFor(get(urlEqualTo("/product/" + productId))
                .willReturn(aResponse().withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withFixedDelay(delayMillis)
                        .withBody("""
                                {"id":"%s","name":"%s","price":9.99,"availability":true}"""
                                .formatted(productId, name))));
    }

    @Test
    void the_calls_run_in_parallel_and_not_serially() {
        stubSimilarIds("p1", "[\"p2\",\"p3\",\"p4\"]");
        stubProduct("p2", "Uno", 100);
        stubProduct("p3", "Dos", 100);
        stubProduct("p4", "Tres", 100);

        List<ProductDetail> products = service.findSimilarProducts("p1").products();

        assertThat(products).hasSize(3);

        // The direct measurement: the three requests reach the source within a few milliseconds of
        // each other. Serially they would be a hundred apart, one per completed call, and no amount
        // of load on the machine turns a serial dispatch into a simultaneous one.
        List<Date> dispatched = existingApi
                .findAll(WireMock.getRequestedFor(urlMatching("/product/p[234]")))
                .stream()
                .map(LoggedRequest::getLoggedDate)
                .sorted()
                .toList();

        assertThat(dispatched).hasSize(3);
        long spread = dispatched.getLast().getTime() - dispatched.getFirst().getTime();
        assertThat(spread)
                .as("milliseconds between the first and the last request being dispatched")
                .isLessThan(100);
    }

    @Test
    void answers_with_what_it_has_when_a_similar_product_takes_too_long() {
        stubSimilarIds("q1", "[\"q2\",\"q3\"]");
        stubProduct("q2", "Rapido", 0);
        stubProduct("q3", "Lentisimo", 5_000);

        long startedAt = System.nanoTime();
        List<ProductDetail> products = service.findSimilarProducts("q1").products();
        Duration elapsed = Duration.ofNanos(System.nanoTime() - startedAt);

        // It returns the one that arrived and does not wait for the one taking five seconds.
        assertThat(products).extracting(ProductDetail::id).containsExactly("q2");
        // The budget is 600 ms, so this bound is the budget plus a second of margin rather than
        // the budget itself.
        assertThat(elapsed).isLessThan(Duration.ofMillis(1_600));
    }

    @Test
    void stops_insisting_on_a_product_that_does_not_answer() {
        stubSimilarIds("r1", "[\"r2\"]");
        stubProduct("r2", "Lentisimo", 5_000);

        service.findSimilarProducts("r1");
        int callsAfterTheFirstAttempt =
                existingApi.findAll(WireMock.getRequestedFor(urlEqualTo("/product/r2"))).size();

        // The next three requests do not try again: the failure is remembered for a few
        // seconds, which acts as a circuit breaker with per-product granularity.
        service.findSimilarProducts("r1");
        service.findSimilarProducts("r1");
        service.findSimilarProducts("r1");

        assertThat(existingApi.findAll(WireMock.getRequestedFor(urlEqualTo("/product/r2"))))
                .hasSize(callsAfterTheFirstAttempt);
    }

    @Test
    void caps_how_many_similar_products_it_resolves_per_request() {
        // Without a cap, a long similar-ids list turns ONE request to this service into as many
        // calls to the source as it has entries. That is an amplification a client can trigger
        // and it needs bounding.
        StringBuilder ids = new StringBuilder("[");
        for (int i = 0; i < 30; i++) {
            if (i > 0) ids.append(',');
            ids.append('"').append("z").append(i).append('"');
            stubProduct("z" + i, "Producto " + i, 0);
        }
        stubSimilarIds("z1000", ids.append(']').toString());

        List<ProductDetail> products = service.findSimilarProducts("z1000").products();

        assertThat(products).hasSize(3);
        assertThat(existingApi.findAll(WireMock.getRequestedFor(
                com.github.tomakehurst.wiremock.client.WireMock.urlMatching("/product/z\\d+"))))
                .hasSize(3);
    }

    @Test
    void a_slow_similar_product_does_not_prevent_returning_the_fast_ones() {
        stubSimilarIds("t1", "[\"t2\",\"t3\",\"t4\"]");
        stubProduct("t2", "Rapido", 0);
        stubProduct("t3", "Lentisimo", 5_000);
        stubProduct("t4", "Tambien rapido", 50);

        List<ProductDetail> products = service.findSimilarProducts("t1").products();

        assertThat(products).extracting(ProductDetail::id).containsExactly("t2", "t4");
    }
}
