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

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Comportamiento del acceso a la API existente, sin levantar Spring.
 *
 * <p>Se construye el componente a mano para poder crear una instancia nueva en cada test, con su
 * propia caché vacía. Es lo que permite comprobar el cacheo sin que un test contamine a otro.
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
    void traduce_un_404_del_detalle_a_producto_inexistente() {
        existingApi.stubFor(get(urlEqualTo("/product/x")).willReturn(aResponse().withStatus(404)));

        assertThat(catalog.lookupDetail("x").join()).isInstanceOf(ProductLookup.Missing.class);
    }

    @Test
    void traduce_un_500_del_detalle_a_no_disponible() {
        existingApi.stubFor(get(urlEqualTo("/product/y")).willReturn(aResponse().withStatus(500)));

        assertThat(catalog.lookupDetail("y").join()).isInstanceOf(ProductLookup.Unavailable.class);
    }

    @Test
    void trata_un_429_del_detalle_como_no_disponible_y_no_como_inexistente() {
        // La diferencia importa porque cada caso se recuerda en cache un tiempo distinto:
        // "no existe" un minuto, "ha fallado" solo unos segundos.
        existingApi.stubFor(get(urlEqualTo("/product/t")).willReturn(aResponse().withStatus(429)));

        assertThat(catalog.lookupDetail("t").join())
                .isInstanceOf(ProductLookup.Unavailable.class);
    }

    @Test
    void trata_un_403_del_detalle_como_no_disponible() {
        existingApi.stubFor(get(urlEqualTo("/product/s")).willReturn(aResponse().withStatus(403)));

        assertThat(catalog.lookupDetail("s").join())
                .isInstanceOf(ProductLookup.Unavailable.class);
    }

    @Test
    void traduce_un_agotamiento_de_tiempo_a_no_disponible() {
        existingApi.stubFor(get(urlEqualTo("/product/z"))
                .willReturn(aResponse().withStatus(200).withFixedDelay(2_000)));

        assertThat(catalog.lookupDetail("z").join()).isInstanceOf(ProductLookup.Unavailable.class);
    }

    @Test
    void devuelve_el_producto_cuando_la_api_responde() {
        existingApi.stubFor(get(urlEqualTo("/product/w")).willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"id\":\"w\",\"name\":\"Shirt\",\"price\":9.99,\"availability\":true}")));

        ProductLookup lookup = catalog.lookupDetail("w").join();

        assertThat(lookup).isInstanceOf(ProductLookup.Found.class);
        assertThat(((ProductLookup.Found) lookup).product().name()).isEqualTo("Shirt");
    }

    @Test
    void consultas_simultaneas_del_mismo_producto_generan_una_sola_llamada() throws Exception {
        // Es el comportamiento que evita que el arranque de una prueba de carga se convierta en
        // doscientas llamadas identicas a un origen lento: la carga de la cache es atomica por
        // clave, asi que una hace el trabajo y las demas esperan su resultado.
        existingApi.stubFor(get(urlEqualTo("/product/comun")).willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withFixedDelay(300)
                .withBody("{\"id\":\"comun\",\"name\":\"Shirt\",\"price\":9.99,\"availability\":true}")));

        ProductCatalog concurrente = newCatalog(Duration.ofSeconds(5));
        List<Callable<ProductLookup>> consultas = IntStream.range(0, 20)
                .mapToObj(ignored -> (Callable<ProductLookup>) () -> concurrente.lookupDetail("comun").join())
                .toList();

        try (ExecutorService pool = Executors.newFixedThreadPool(20)) {
            for (var future : pool.invokeAll(consultas)) {
                assertThat(future.get()).isInstanceOf(ProductLookup.Found.class);
            }
        }

        existingApi.verify(1, com.github.tomakehurst.wiremock.client.WireMock
                .getRequestedFor(urlEqualTo("/product/comun")));
    }

    @Test
    void lanza_producto_inexistente_cuando_no_hay_lista_de_similares() {
        existingApi.stubFor(get(urlEqualTo("/product/v/similarids"))
                .willReturn(aResponse().withStatus(404)));

        assertThatThrownBy(() -> catalog.similarIds("v"))
                .isInstanceOf(ProductNotFoundException.class);
    }

    @Test
    void lanza_dependencia_no_disponible_cuando_los_similares_fallan() {
        existingApi.stubFor(get(urlEqualTo("/product/u/similarids"))
                .willReturn(aResponse().withStatus(500)));

        assertThatThrownBy(() -> catalog.similarIds("u"))
                .isInstanceOf(ExistingApiUnavailableException.class);
    }
}
