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
 * Recorrido completo de la operación, entrando por HTTP y con la API existente sustituida por un
 * doble que reproduce los mismos casos que el simulador de la prueba: retardos, 404 y 500.
 *
 * <p>Cada test usa identificadores propios. La caché es un componente único compartido por todo
 * el contexto de Spring, así que reutilizar identificadores haría que un test viera lo que dejó
 * otro; con identificadores distintos los tests quedan aislados sin necesidad de reconstruir el
 * contexto, que es lo caro.
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

    /** Para los casos de error: el cuerpo es un ProblemDetail, no una lista de productos. */
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
    void devuelve_el_detalle_de_todos_los_similares() {
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
    void conserva_el_orden_de_similitud_que_informa_la_api() {
        stubSimilarIds("b1", "[\"b3\",\"b2\",\"b4\"]");
        stubProduct("b2", "Dress", 19.99);
        stubProduct("b3", "Blazer", 29.99);
        stubProduct("b4", "Boots", 39.99);

        List<ProductDetail> products = getSimilar("b1").getBody();

        // El orden de la respuesta es el de la lista de similares, no el de llegada de las
        // respuestas: las llamadas van en paralelo y terminan en cualquier orden.
        assertThat(products).extracting(ProductDetail::id).containsExactly("b3", "b2", "b4");
    }

    @Test
    void descarta_los_identificadores_repetidos() {
        stubSimilarIds("c1", "[\"c2\",\"c2\",\"c3\"]");
        stubProduct("c2", "Dress", 19.99);
        stubProduct("c3", "Blazer", 29.99);

        List<ProductDetail> products = getSimilar("c1").getBody();

        assertThat(products).extracting(ProductDetail::id).containsExactly("c2", "c3");
    }

    @Test
    void acepta_los_identificadores_numericos_que_devuelve_el_simulador() {
        // El contrato declara la lista como cadenas, pero el simulador de la prueba responde
        // `[2,3,4]` con números. Hay que aceptar las dos formas.
        stubSimilarIds("d1", "[91,92]");
        stubProduct("91", "Shirt", 9.99);
        stubProduct("92", "Dress", 19.99);

        List<ProductDetail> products = getSimilar("d1").getBody();

        assertThat(products).extracting(ProductDetail::id).containsExactly("91", "92");
    }

    @Test
    void devuelve_404_cuando_el_producto_de_la_peticion_no_existe() {
        existingApi.stubFor(get(urlEqualTo("/product/e1/similarids"))
                .willReturn(aResponse().withStatus(404)));

        assertThat(getSimilarRaw("e1").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void devuelve_502_cuando_la_api_existente_falla_al_dar_los_similares() {
        existingApi.stubFor(get(urlEqualTo("/product/f1/similarids"))
                .willReturn(aResponse().withStatus(500)));

        // No es un 500: el fallo es de una dependencia, no de este servicio.
        assertThat(getSimilarRaw("f1").getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }

    @Test
    void omite_un_similar_que_ya_no_existe_en_lugar_de_fallar_la_respuesta_entera() {
        stubSimilarIds("g1", "[\"g2\",\"g3\"]");
        stubProduct("g2", "Dress", 19.99);
        existingApi.stubFor(get(urlEqualTo("/product/g3")).willReturn(aResponse().withStatus(404)));

        ResponseEntity<List<ProductDetail>> response = getSimilar("g1");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).extracting(ProductDetail::id).containsExactly("g2");
    }

    @Test
    void omite_un_similar_que_devuelve_error() {
        stubSimilarIds("h1", "[\"h2\",\"h3\"]");
        stubProduct("h2", "Dress", 19.99);
        existingApi.stubFor(get(urlEqualTo("/product/h3")).willReturn(aResponse().withStatus(500)));

        ResponseEntity<List<ProductDetail>> response = getSimilar("h1");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).extracting(ProductDetail::id).containsExactly("h2");
    }

    @Test
    void devuelve_lista_vacia_cuando_el_producto_no_tiene_similares() {
        stubSimilarIds("i1", "[]");

        ResponseEntity<List<ProductDetail>> response = getSimilar("i1");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEmpty();
    }

    @Test
    void conserva_los_decimales_del_precio() {
        stubSimilarIds("j1", "[\"j2\"]");
        stubProduct("j2", "Coat", 89.99);

        List<ProductDetail> products = getSimilar("j1").getBody();

        assertThat(products).singleElement()
                .extracting(ProductDetail::price)
                .isEqualTo(new java.math.BigDecimal("89.99"));
    }

    @Test
    void tolera_un_identificador_nulo_en_la_lista_de_similares() {
        // Un `null` dentro del array JSON llega como elemento nulo de la lista, y
        // `List.copyOf` rechaza los nulos con NullPointerException.
        stubSimilarIds("n1", "[\"n2\",null,\"n3\"]");
        stubProduct("n2", "Dress", 19.99);
        stubProduct("n3", "Blazer", 29.99);

        ResponseEntity<List<ProductDetail>> response = getSimilar("n1");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).extracting(ProductDetail::id).containsExactly("n2", "n3");
    }

    @Test
    void descarta_los_identificadores_vacios_sin_llamar_a_la_api() {
        stubSimilarIds("o1", "[\"\",\"  \",\"o2\"]");
        stubProduct("o2", "Dress", 19.99);

        List<ProductDetail> products = getSimilar("o1").getBody();

        assertThat(products).extracting(ProductDetail::id).containsExactly("o2");
        // Un identificador vacio produciria una llamada a /product/, que no significa nada.
        existingApi.verify(0, WireMock.getRequestedFor(urlEqualTo("/product/")));
    }

    @Test
    void devuelve_502_y_no_404_cuando_la_api_existente_limita_las_peticiones() {
        // Un 429 no significa "el producto no existe": significa "vuelve luego".
        existingApi.stubFor(get(urlEqualTo("/product/r9/similarids"))
                .willReturn(aResponse().withStatus(429)));

        assertThat(getSimilarRaw("r9").getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }

    @Test
    void omite_un_similar_cuyo_detalle_llega_sin_identificador() {
        stubSimilarIds("s9", "[\"s8\",\"s7\"]");
        stubProduct("s8", "Dress", 19.99);
        existingApi.stubFor(get(urlEqualTo("/product/s7")).willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"name\":\"Sin identificador\",\"price\":9.99,\"availability\":true}")));

        List<ProductDetail> products = getSimilar("s9").getBody();

        // Sin identificador el producto no es utilizable, y devolverlo incumpliria el contrato,
        // que declara `id` obligatorio.
        assertThat(products).extracting(ProductDetail::id).containsExactly("s8");
    }

    @Test
    void rechaza_un_identificador_desmesurado_sin_llegar_a_la_api() {
        String largo = "a".repeat(3_000);

        ResponseEntity<String> response = getSimilarRaw(largo);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // Lo importante: no se reenvia al origen ni se convierte en una clave de cache.
        existingApi.verify(0, WireMock.getRequestedFor(
                urlEqualTo("/product/" + largo + "/similarids")));
    }

    @Test
    void responde_a_una_ruta_desconocida_sin_revelar_como_esta_construido_el_servicio() {
        ResponseEntity<String> response =
                restTemplate.getForEntity("/una/ruta/inventada", String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        // Por omision, Spring responde "No static resource <ruta>." y devuelve al cliente la
        // ruta que envio. Ni una cosa ni la otra le sirven a nadie mas que a quien explora.
        assertThat(response.getBody()).doesNotContain("static resource");
    }

    @Test
    void no_vuelve_a_llamar_a_la_api_para_un_detalle_ya_cacheado() {
        stubSimilarIds("k1", "[\"k2\"]");
        stubProduct("k2", "Dress", 19.99);

        getSimilar("k1");
        getSimilar("k1");

        existingApi.verify(1, WireMock.getRequestedFor(urlEqualTo("/product/k2")));
    }
}
