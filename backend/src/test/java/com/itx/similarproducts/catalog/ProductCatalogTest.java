package com.itx.similarproducts.catalog;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;

import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import com.itx.similarproducts.config.ExistingApiProperties;
import com.itx.similarproducts.domain.ProductDetail;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Behaviour of the access to the existing API, without booting Spring.
 *
 * <p>The component is built by hand so that a fresh instance with its own empty cache can be
 * created per test. That is what makes it possible to check the caching without one test
 * contaminating another.
 */
class ProductCatalogTest {

    @RegisterExtension
    static WireMockExtension existingApi = WireMockExtension.newInstance()
            .options(wireMockConfig().dynamicPort())
            .build();

    private ProductCatalog catalog;

    @BeforeEach
    void setUp() {
        catalog = newCatalog(Duration.ofMillis(500));
    }

    private static ProductCatalog newCatalog(Duration readTimeout) {
        ExistingApiProperties properties = new ExistingApiProperties(
                existingApi.baseUrl(),
                Duration.ofSeconds(1),
                readTimeout,
                Duration.ofSeconds(1),
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

        return new ProductCatalog(client, Executors.newVirtualThreadPerTaskExecutor(), properties);
    }

    @Test
    void translates_a_404_of_the_detail_into_product_not_found() {
        existingApi.stubFor(get(urlEqualTo("/product/x")).willReturn(aResponse().withStatus(404)));

        assertThat(catalog.lookupDetail("x").join()).isInstanceOf(Lookup.Missing.class);
    }

    @Test
    void translates_a_500_of_the_detail_into_unavailable() {
        existingApi.stubFor(get(urlEqualTo("/product/y")).willReturn(aResponse().withStatus(500)));

        assertThat(catalog.lookupDetail("y").join()).isInstanceOf(Lookup.Unavailable.class);
    }

    @Test
    void treats_a_429_of_the_detail_as_unavailable_and_not_as_missing() {
        // The difference matters because each case is cached for a different length of time:
        // "does not exist" for a minute, "it failed" for a few seconds only.
        existingApi.stubFor(get(urlEqualTo("/product/t")).willReturn(aResponse().withStatus(429)));

        assertThat(catalog.lookupDetail("t").join())
                .isInstanceOf(Lookup.Unavailable.class);
    }

    @Test
    void treats_a_403_of_the_detail_as_unavailable() {
        existingApi.stubFor(get(urlEqualTo("/product/s")).willReturn(aResponse().withStatus(403)));

        assertThat(catalog.lookupDetail("s").join())
                .isInstanceOf(Lookup.Unavailable.class);
    }

    @Test
    void translates_a_timeout_into_unavailable() {
        existingApi.stubFor(get(urlEqualTo("/product/z"))
                .willReturn(aResponse().withStatus(200).withFixedDelay(2_000)));

        assertThat(catalog.lookupDetail("z").join()).isInstanceOf(Lookup.Unavailable.class);
    }

    @Test
    void returns_the_product_when_the_api_answers() {
        existingApi.stubFor(get(urlEqualTo("/product/w")).willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"id\":\"w\",\"name\":\"Shirt\",\"price\":9.99,\"availability\":true}")));

        Lookup<ProductDetail> lookup = catalog.lookupDetail("w").join();

        assertThat(lookup).isInstanceOf(Lookup.Found.class);
        assertThat(((Lookup.Found<ProductDetail>) lookup).value().name()).isEqualTo("Shirt");
    }

    @Test
    void concurrent_lookups_of_the_same_product_produce_a_single_call() throws Exception {
        // This is the behaviour that stops the start of a load test from turning into two hundred
        // identical calls to a slow source: the cache load is atomic per key, so one thread does
        // the work and the rest wait for its result.
        existingApi.stubFor(get(urlEqualTo("/product/comun")).willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withFixedDelay(300)
                .withBody("{\"id\":\"comun\",\"name\":\"Shirt\",\"price\":9.99,\"availability\":true}")));

        ProductCatalog isolatedCatalog = newCatalog(Duration.ofSeconds(5));
        List<Callable<Lookup<ProductDetail>>> lookups = IntStream.range(0, 20)
                .mapToObj(ignored -> (Callable<Lookup<ProductDetail>>) () -> isolatedCatalog.lookupDetail("comun").join())
                .toList();

        try (ExecutorService pool = Executors.newFixedThreadPool(20)) {
            for (var future : pool.invokeAll(lookups)) {
                assertThat(future.get()).isInstanceOf(Lookup.Found.class);
            }
        }

        existingApi.verify(1, com.github.tomakehurst.wiremock.client.WireMock
                .getRequestedFor(urlEqualTo("/product/comun")));
    }

    @Test
    void throws_product_not_found_when_there_is_no_similar_ids_list() {
        existingApi.stubFor(get(urlEqualTo("/product/v/similarids"))
                .willReturn(aResponse().withStatus(404)));

        assertThatThrownBy(() -> catalog.similarIds("v"))
                .isInstanceOf(ProductNotFoundException.class);
    }

    @Test
    void throws_dependency_unavailable_when_the_similar_ids_fail() {
        existingApi.stubFor(get(urlEqualTo("/product/u/similarids"))
                .willReturn(aResponse().withStatus(500)));

        assertThatThrownBy(() -> catalog.similarIds("u"))
                .isInstanceOf(ExistingApiUnavailableException.class);
    }
}
