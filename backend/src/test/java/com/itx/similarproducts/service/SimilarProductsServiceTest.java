package com.itx.similarproducts.service;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.Executors;

import com.github.tomakehurst.wiremock.client.WireMock;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import com.itx.similarproducts.catalog.ProductCatalog;
import com.itx.similarproducts.config.ExistingApiProperties;
import com.itx.similarproducts.domain.ProductDetail;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the decision <b>not to cancel</b> the call that falls outside the budget.
 *
 * <p>This test exists because it was missing. Nine realistic defects were deliberately injected
 * into the service to see which ones the tests caught, and this was the only one that went
 * unnoticed: adding {@code future.cancel(true)} back broke no test. And it is not a cosmetic
 * detail, for two reasons:
 *
 * <ul>
 *   <li>Cancelling throws away the work that was about to speed subsequent requests up, which is
 *       exactly what we want to avoid.
 *   <li>The future that would be cancelled is <b>the one the cache holds</b>, because it is what
 *       {@code AsyncCache.get} returns. Cancelling it does not interrupt the call — {@code
 *       CompletableFuture} ignores the interruption request — but it does leave the cache entry
 *       failed, so on top of losing the work it poisons the cache for everyone waiting on it.
 * </ul>
 *
 * <p>It is wired by hand, without a Spring context, so that the catalogue and the service can be
 * given different timeouts: the call has to be able to complete (2 s read timeout) long after the
 * request has stopped waiting for it (200 ms budget).
 */
class SimilarProductsServiceTest {

    @RegisterExtension
    static WireMockExtension existingApi = WireMockExtension.newInstance()
            .options(wireMockConfig().dynamicPort())
            .build();

    private static final Duration BUDGET = Duration.ofMillis(200);
    private static final int SLOW_PRODUCT_DELAY_MS = 600;

    private SimilarProductsService service;

    @BeforeEach
    void setUp() {
        ExistingApiProperties properties = new ExistingApiProperties(
                existingApi.baseUrl(),
                Duration.ofSeconds(1),
                // The call is given far more time than the request is willing to wait for: that
                // is the situation that makes not cancelling it useful.
                Duration.ofSeconds(2),
                BUDGET,
                Duration.ofMinutes(5),
                Duration.ofMinutes(1),
                Duration.ofSeconds(10),
                50);

        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build());
        factory.setReadTimeout(properties.readTimeout());

        RestClient client = RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(factory)
                .build();

        ProductCatalog catalog = new ProductCatalog(
                client, Executors.newVirtualThreadPerTaskExecutor(), properties);
        service = new SimilarProductsService(catalog, properties);
    }

    private static void stubProduct(String id, int delayMillis) {
        existingApi.stubFor(get(urlEqualTo("/product/" + id)).willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withFixedDelay(delayMillis)
                .withBody("""
                        {"id":"%s","name":"Producto %s","price":9.99,"availability":true}"""
                        .formatted(id, id))));
    }

    @Test
    void the_abandoned_call_finishes_and_leaves_the_product_in_the_cache() throws InterruptedException {
        existingApi.stubFor(get(urlEqualTo("/product/base/similarids")).willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withBody("[\"rapido\",\"lento\"]")));
        stubProduct("rapido", 0);
        stubProduct("lento", SLOW_PRODUCT_DELAY_MS);

        // First request: the slow one does not fit in the budget and is left out.
        List<ProductDetail> first = service.findSimilarProducts("base");
        assertThat(first).extracting(ProductDetail::id).containsExactly("rapido");

        // Had the abandoned call been cancelled, it would have left nothing in the cache and
        // subsequent requests would keep returning a single product.
        List<ProductDetail> afterwards = waitUntilBothArrive();

        assertThat(afterwards).extracting(ProductDetail::id).containsExactly("rapido", "lento");
        // And with a single call to the source: the abandoned one is what filled the cache.
        existingApi.verify(1, WireMock.getRequestedFor(urlEqualTo("/product/lento")));
    }

    /**
     * Retries until the in-flight load finishes populating the cache.
     *
     * <p>It polls rather than sleeping a fixed amount: sleeping just enough makes the test flaky on
     * a loaded machine, and sleeping generously makes it slow for no reason.
     */
    private List<ProductDetail> waitUntilBothArrive() throws InterruptedException {
        Instant deadline = Instant.now().plusSeconds(5);
        List<ProductDetail> result = List.of();

        while (Instant.now().isBefore(deadline)) {
            result = service.findSimilarProducts("base");
            if (result.size() == 2) {
                return result;
            }
            Thread.sleep(50);
        }
        return result;
    }
}
