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
 * Comportamiento del servicio ante una API existente lenta o caída.
 *
 * <p>Los límites de tiempo se recortan a centenares de milisegundos para que los tests corran
 * rápido; en producción son segundos. Lo que se comprueba es el comportamiento, no los valores.
 */
@SpringBootTest(properties = {
        "existing-api.read-timeout=400ms",
        "existing-api.fan-out-timeout=600ms",
        "existing-api.unavailable-ttl=2s"
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
    void las_llamadas_van_en_paralelo_no_en_serie() {
        // Tres detalles de 300 ms cada uno. En serie serían 900 ms y no cabrían en el
        // presupuesto de 600 ms; en paralelo terminan en algo más de 300.
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
    void responde_con_lo_que_tiene_cuando_un_similar_tarda_demasiado() {
        stubSimilarIds("q1", "[\"q2\",\"q3\"]");
        stubProduct("q2", "Rapido", 0);
        stubProduct("q3", "Lentisimo", 5_000);

        long startedAt = System.nanoTime();
        List<ProductDetail> products = service.findSimilarProducts("q1");
        Duration elapsed = Duration.ofNanos(System.nanoTime() - startedAt);

        // Devuelve el que llegó y no espera al que tarda cinco segundos.
        assertThat(products).extracting(ProductDetail::id).containsExactly("q2");
        assertThat(elapsed).isLessThan(Duration.ofSeconds(2));
    }

    @Test
    void deja_de_insistir_con_un_producto_que_no_responde() {
        stubSimilarIds("r1", "[\"r2\"]");
        stubProduct("r2", "Lentisimo", 5_000);

        service.findSimilarProducts("r1");
        int llamadasTrasElPrimerIntento =
                existingApi.findAll(WireMock.getRequestedFor(urlEqualTo("/product/r2"))).size();

        // Las tres peticiones siguientes no vuelven a intentarlo: el fallo se recuerda unos
        // segundos, lo que hace de cortacircuitos con granularidad por producto.
        service.findSimilarProducts("r1");
        service.findSimilarProducts("r1");
        service.findSimilarProducts("r1");

        assertThat(existingApi.findAll(WireMock.getRequestedFor(urlEqualTo("/product/r2"))))
                .hasSize(llamadasTrasElPrimerIntento);
    }

    @Test
    void un_similar_lento_no_impide_devolver_los_rapidos() {
        stubSimilarIds("t1", "[\"t2\",\"t3\",\"t4\"]");
        stubProduct("t2", "Rapido", 0);
        stubProduct("t3", "Lentisimo", 5_000);
        stubProduct("t4", "Tambien rapido", 50);

        List<ProductDetail> products = service.findSimilarProducts("t1");

        assertThat(products).extracting(ProductDetail::id).containsExactly("t2", "t4");
    }
}
