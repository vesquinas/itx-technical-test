package com.itx.similarproducts;

import java.util.List;

import com.github.tomakehurst.wiremock.client.WireMock;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.itx.similarproducts.domain.ProductDetail;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Full walk-through of the operation, entering over HTTP and with the existing API replaced by a
 * double that reproduces the same cases as the test's mock service: delays, 404s and 500s.
 *
 * <p>Every test uses its own identifiers. The cache is a single component shared across the whole
 * Spring context, so reusing identifiers would let one test see what another left behind; with
 * distinct identifiers the tests stay isolated without rebuilding the context, which is the
 * expensive part.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SimilarProductsApiTest {

    @RegisterExtension
    static WireMockExtension existingApi = WireMockExtension.newInstance()
            .options(wireMockConfig().dynamicPort())
            .build();

    @DynamicPropertySource
    static void existingApiProperties(DynamicPropertyRegistry registry) {
        registry.add("existing-api.base-url", existingApi::baseUrl);
    }

    @Autowired
    private TestRestTemplate restTemplate;

    private static void stubSimilarIds(String productId, String body) {
        existingApi.stubFor(get(urlEqualTo("/product/" + productId + "/similarids"))
                .willReturn(okJson(body)));
    }

    private static void stubProduct(String productId, String name, double price) {
        existingApi.stubFor(get(urlEqualTo("/product/" + productId))
                .willReturn(okJson("""
                        {"id":"%s","name":"%s","price":%s,"availability":true}"""
                        .formatted(productId, name, price))));
    }

    private static com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder okJson(String body) {
        return aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withBody(body);
    }

    /** For the failure cases: the body is a ProblemDetail, not a list of products. */
    private ResponseEntity<String> getSimilarRaw(String productId) {
        return restTemplate.getForEntity("/product/{productId}/similar", String.class, productId);
    }

    private ResponseEntity<List<ProductDetail>> getSimilar(String productId) {
        return restTemplate.exchange(
                "/product/{productId}/similar",
                org.springframework.http.HttpMethod.GET,
                null,
                new org.springframework.core.ParameterizedTypeReference<List<ProductDetail>>() {
                },
                productId);
    }

    @Test
    void returns_the_detail_of_every_similar_product() {
        stubSimilarIds("a1", "[\"a2\",\"a3\"]");
        stubProduct("a2", "Dress", 19.99);
        stubProduct("a3", "Blazer", 29.99);

        ResponseEntity<List<ProductDetail>> response = getSimilar("a1");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody())
                .extracting(ProductDetail::id, ProductDetail::name)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("a2", "Dress"),
                        org.assertj.core.groups.Tuple.tuple("a3", "Blazer"));
    }

    @Test
    void keeps_the_order_of_similarity_reported_by_the_api() {
        stubSimilarIds("b1", "[\"b3\",\"b2\",\"b4\"]");
        stubProduct("b2", "Dress", 19.99);
        stubProduct("b3", "Blazer", 29.99);
        stubProduct("b4", "Boots", 39.99);

        List<ProductDetail> products = getSimilar("b1").getBody();

        // The order of the response is that of the similar-ids list, not the order the responses
        // arrive in: the calls run in parallel and finish in any order.
        assertThat(products).extracting(ProductDetail::id).containsExactly("b3", "b2", "b4");
    }

    @Test
    void drops_duplicate_identifiers() {
        stubSimilarIds("c1", "[\"c2\",\"c2\",\"c3\"]");
        stubProduct("c2", "Dress", 19.99);
        stubProduct("c3", "Blazer", 29.99);

        List<ProductDetail> products = getSimilar("c1").getBody();

        assertThat(products).extracting(ProductDetail::id).containsExactly("c2", "c3");
    }

    @Test
    void accepts_the_numeric_identifiers_the_mock_returns() {
        // The contract declares the list as strings, but the test's mock answers `[2,3,4]` with
        // numbers. Both shapes have to be accepted.
        stubSimilarIds("d1", "[91,92]");
        stubProduct("91", "Shirt", 9.99);
        stubProduct("92", "Dress", 19.99);

        List<ProductDetail> products = getSimilar("d1").getBody();

        assertThat(products).extracting(ProductDetail::id).containsExactly("91", "92");
    }

    @Test
    void returns_404_when_the_requested_product_does_not_exist() {
        existingApi.stubFor(get(urlEqualTo("/product/e1/similarids"))
                .willReturn(aResponse().withStatus(404)));

        assertThat(getSimilarRaw("e1").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void returns_502_when_the_existing_api_fails_to_give_the_similar_ids() {
        existingApi.stubFor(get(urlEqualTo("/product/f1/similarids"))
                .willReturn(aResponse().withStatus(500)));

        // Not a 500: the failure belongs to a dependency, not to this service.
        assertThat(getSimilarRaw("f1").getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }

    @Test
    void leaves_out_a_similar_product_that_no_longer_exists_instead_of_failing_the_whole_response() {
        stubSimilarIds("g1", "[\"g2\",\"g3\"]");
        stubProduct("g2", "Dress", 19.99);
        existingApi.stubFor(get(urlEqualTo("/product/g3")).willReturn(aResponse().withStatus(404)));

        ResponseEntity<List<ProductDetail>> response = getSimilar("g1");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).extracting(ProductDetail::id).containsExactly("g2");
    }

    @Test
    void leaves_out_a_similar_product_that_returns_an_error() {
        stubSimilarIds("h1", "[\"h2\",\"h3\"]");
        stubProduct("h2", "Dress", 19.99);
        existingApi.stubFor(get(urlEqualTo("/product/h3")).willReturn(aResponse().withStatus(500)));

        ResponseEntity<List<ProductDetail>> response = getSimilar("h1");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).extracting(ProductDetail::id).containsExactly("h2");
    }

    @Test
    void returns_an_empty_list_when_the_product_has_no_similar_products() {
        stubSimilarIds("i1", "[]");

        ResponseEntity<List<ProductDetail>> response = getSimilar("i1");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEmpty();
    }

    @Test
    void keeps_the_decimals_of_the_price() {
        stubSimilarIds("j1", "[\"j2\"]");
        stubProduct("j2", "Coat", 89.99);

        List<ProductDetail> products = getSimilar("j1").getBody();

        assertThat(products).singleElement()
                .extracting(ProductDetail::price)
                .isEqualTo(new java.math.BigDecimal("89.99"));
    }

    @Test
    void tolerates_a_null_identifier_in_the_similar_ids_list() {
        // A `null` inside the JSON array arrives as a null list element, and `List.copyOf`
        // rejects nulls with NullPointerException.
        stubSimilarIds("n1", "[\"n2\",null,\"n3\"]");
        stubProduct("n2", "Dress", 19.99);
        stubProduct("n3", "Blazer", 29.99);

        ResponseEntity<List<ProductDetail>> response = getSimilar("n1");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).extracting(ProductDetail::id).containsExactly("n2", "n3");
    }

    @Test
    void drops_blank_identifiers_without_calling_the_api() {
        stubSimilarIds("o1", "[\"\",\"  \",\"o2\"]");
        stubProduct("o2", "Dress", 19.99);

        List<ProductDetail> products = getSimilar("o1").getBody();

        assertThat(products).extracting(ProductDetail::id).containsExactly("o2");
        // A blank identifier would produce a call to /product/, which means nothing.
        existingApi.verify(0, WireMock.getRequestedFor(urlEqualTo("/product/")));
    }

    @Test
    void returns_502_and_not_404_when_the_existing_api_rate_limits() {
        // A 429 does not mean "the product does not exist": it means "come back later".
        existingApi.stubFor(get(urlEqualTo("/product/r9/similarids"))
                .willReturn(aResponse().withStatus(429)));

        assertThat(getSimilarRaw("r9").getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }

    @Test
    void leaves_out_a_similar_product_whose_detail_arrives_with_no_identifier() {
        stubSimilarIds("s9", "[\"s8\",\"s7\"]");
        stubProduct("s8", "Dress", 19.99);
        existingApi.stubFor(get(urlEqualTo("/product/s7")).willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"name\":\"Sin identificador\",\"price\":9.99,\"availability\":true}")));

        List<ProductDetail> products = getSimilar("s9").getBody();

        // With no identifier the product is unusable, and returning it would break the contract,
        // which declares `id` mandatory.
        assertThat(products).extracting(ProductDetail::id).containsExactly("s8");
    }

    @Test
    void rejects_an_oversized_identifier_without_reaching_the_api() {
        String oversized = "a".repeat(3_000);

        ResponseEntity<String> response = getSimilarRaw(oversized);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // The point: it is neither forwarded to the source nor turned into a cache key.
        existingApi.verify(0, WireMock.getRequestedFor(
                urlEqualTo("/product/" + oversized + "/similarids")));
    }

    @Test
    void answers_an_unknown_path_without_revealing_how_the_service_is_built() {
        ResponseEntity<String> response =
                restTemplate.getForEntity("/una/ruta/inventada", String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        // By default Spring answers "No static resource <path>." and hands the client back the
        // path it sent. Neither serves anyone but someone probing the service.
        assertThat(response.getBody()).doesNotContain("static resource");
    }

    @Test
    void does_not_call_the_api_again_for_an_already_cached_detail() {
        stubSimilarIds("k1", "[\"k2\"]");
        stubProduct("k2", "Dress", 19.99);

        getSimilar("k1");
        getSimilar("k1");

        existingApi.verify(1, WireMock.getRequestedFor(urlEqualTo("/product/k2")));
    }
}
