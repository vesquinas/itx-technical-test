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
 * Protege la decisión de <b>no cancelar</b> la llamada que se queda fuera del presupuesto.
 *
 * <p>Este test existe porque faltaba. Se inyectaron a propósito nueve fallos realistas en el
 * servicio para ver cuáles detectaban los tests, y este fue el único que pasó desapercibido:
 * volver a añadir {@code future.cancel(true)} no rompía ninguna prueba. Y no es un detalle
 * cosmético, por dos motivos:
 *
 * <ul>
 *   <li>Cancelar tira el trabajo que iba a acelerar las peticiones siguientes, que es justo lo
 *       que se quiere evitar.
 *   <li>El futuro que se cancelaría es <b>el que guarda la caché</b>, porque es el que devuelve
 *       {@code AsyncCache.get}. Cancelarlo no interrumpe la llamada —{@code CompletableFuture}
 *       ignora la petición de interrupción— pero sí deja fallida la entrada de caché, así que
 *       además de perder el trabajo se envenena la caché para todos los que la esperaban.
 * </ul>
 *
 * <p>Se monta a mano, sin contexto de Spring, para poder dar al catálogo y al servicio límites de
 * tiempo distintos: la llamada tiene que poder completarse (2 s de lectura) mucho después de que
 * la petición haya dejado de esperarla (200 ms de presupuesto).
 */
class SimilarProductsServiceTest {

    @RegisterExtension
    static WireMockExtension existingApi = WireMockExtension.newInstance()
            .options(wireMockConfig().dynamicPort())
            .build();

    private static final Duration PRESUPUESTO = Duration.ofMillis(200);
    private static final int RETARDO_DEL_LENTO_MS = 600;

    private SimilarProductsService service;

    @BeforeEach
    void setUp() {
        ExistingApiProperties propiedades = new ExistingApiProperties(
                existingApi.baseUrl(),
                Duration.ofSeconds(1),
                // La llamada dispone de mucho más tiempo del que la petición está dispuesta a
                // esperar: es la situación que hace útil no cancelarla.
                Duration.ofSeconds(2),
                PRESUPUESTO,
                Duration.ofMinutes(5),
                Duration.ofMinutes(1),
                Duration.ofSeconds(10),
                50);

        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build());
        factory.setReadTimeout(propiedades.readTimeout());

        RestClient client = RestClient.builder()
                .baseUrl(propiedades.baseUrl())
                .requestFactory(factory)
                .build();

        ProductCatalog catalog = new ProductCatalog(
                client, Executors.newVirtualThreadPerTaskExecutor(), propiedades);
        service = new SimilarProductsService(catalog, propiedades);
    }

    private static void stubProducto(String id, int retardoMillis) {
        existingApi.stubFor(get(urlEqualTo("/product/" + id)).willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withFixedDelay(retardoMillis)
                .withBody("""
                        {"id":"%s","name":"Producto %s","price":9.99,"availability":true}"""
                        .formatted(id, id))));
    }

    @Test
    void la_llamada_descartada_termina_y_deja_el_producto_en_cache() throws InterruptedException {
        existingApi.stubFor(get(urlEqualTo("/product/base/similarids")).willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withBody("[\"rapido\",\"lento\"]")));
        stubProducto("rapido", 0);
        stubProducto("lento", RETARDO_DEL_LENTO_MS);

        // Primera petición: el lento no cabe en el presupuesto y se omite.
        List<ProductDetail> primera = service.findSimilarProducts("base");
        assertThat(primera).extracting(ProductDetail::id).containsExactly("rapido");

        // Si la llamada descartada se hubiese cancelado, no habría dejado nada en la caché y las
        // peticiones siguientes seguirían devolviendo un solo producto.
        List<ProductDetail> despues = esperarHastaQueLleguenDos();

        assertThat(despues).extracting(ProductDetail::id).containsExactly("rapido", "lento");
        // Y con una sola llamada al origen: la abandonada es la que llenó la caché.
        existingApi.verify(1, WireMock.getRequestedFor(urlEqualTo("/product/lento")));
    }

    /**
     * Reintenta hasta que la carga en curso termina de poblar la caché.
     *
     * <p>Se sondea en lugar de dormir un tiempo fijo: dormir lo justo hace el test frágil en una
     * máquina cargada, y dormir de sobra lo hace lento sin necesidad.
     */
    private List<ProductDetail> esperarHastaQueLleguenDos() throws InterruptedException {
        Instant limite = Instant.now().plusSeconds(5);
        List<ProductDetail> resultado = List.of();

        while (Instant.now().isBefore(limite)) {
            resultado = service.findSimilarProducts("base");
            if (resultado.size() == 2) {
                return resultado;
            }
            Thread.sleep(50);
        }
        return resultado;
    }
}
