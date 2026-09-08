package com.itx.similarproducts;

import java.time.Duration;
import java.util.List;

import com.github.tomakehurst.wiremock.client.WireMock;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
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
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Behaviour of the service against a slow or downed existing API.
 *
 * <p>The timeouts are cut down to hundreds of milliseconds so the tests run fast; in production
 * they are seconds. What is being checked is the behaviour, not the values.
 */
@SpringBootTest(properties = {
        "existing-api.read-timeout=400ms",
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
        // Three details of 300 ms each. Serially that would be 900 ms and would not fit in the
        // 600 ms budget; in parallel they finish in a little over 300.
        stubSimilarIds("p1", "[\"p2\",\"p3\",\"p4\"]");
        stubProduct("p2", "Uno", 300);
        stubProduct("p3", "Dos", 300);
        stubProduct("p4", "Tres", 300);

        long startedAt = System.nanoTime();
        List<ProductDetail> products = service.findSimilarProducts("p1");
        Duration elapsed = Duration.ofNanos(System.nanoTime() - startedAt);

        assertThat(products).hasSize(3);
        assertThat(elapsed).isLessThan(Duration.ofMillis(900));
    }

    @Test
    void answers_with_what_it_has_when_a_similar_product_takes_too_long() {
        stubSimilarIds("q1", "[\"q2\",\"q3\"]");
        stubProduct("q2", "Rapido", 0);
        stubProduct("q3", "Lentisimo", 5_000);

        long startedAt = System.nanoTime();
        List<ProductDetail> products = service.findSimilarProducts("q1");
        Duration elapsed = Duration.ofNanos(System.nanoTime() - startedAt);

        // It returns the one that arrived and does not wait for the one taking five seconds.
        assertThat(products).extracting(ProductDetail::id).containsExactly("q2");
        assertThat(elapsed).isLessThan(Duration.ofSeconds(2));
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

        List<ProductDetail> products = service.findSimilarProducts("z1000");

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

        List<ProductDetail> products = service.findSimilarProducts("t1");

        assertThat(products).extracting(ProductDetail::id).containsExactly("t2", "t4");
    }
}
