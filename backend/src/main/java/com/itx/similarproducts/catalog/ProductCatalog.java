package com.itx.similarproducts.catalog;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;

import com.github.benmanes.caffeine.cache.AsyncCache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Expiry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.itx.similarproducts.config.ExistingApiProperties;
import com.itx.similarproducts.domain.ProductDetail;

/**
 * Acceso a la API existente, con caché.
 *
 * <p>Es la única pieza que habla con el exterior, y es donde vive casi todo el rendimiento del
 * servicio.
 *
 * <h2>La caché hace dos trabajos, no uno</h2>
 *
 * Lo evidente es evitar repetir llamadas ya resueltas. El menos evidente, y aquí el más valioso,
 * es la <b>deduplicación</b>: la caché guarda la llamada en curso, no solo su resultado, así que
 * si doscientas peticiones simultáneas necesitan el mismo producto, una sola llega al origen y
 * las demás esperan ese mismo resultado. Sin eso, el arranque de cada escenario de la prueba de
 * carga lanza doscientas llamadas idénticas contra un origen que además es lento.
 *
 * <h2>Por qué la caché es asíncrona: hilos virtuales y monitores</h2>
 *
 * Es una {@link AsyncCache} y no la variante sincrónica, y ese detalle es la razón por la que
 * este servicio rinde.
 *
 * <p>La caché sincrónica de Caffeine se apoya en {@code ConcurrentHashMap.computeIfAbsent}, que
 * ejecuta la función de carga <b>dentro de un bloque {@code synchronized}</b>. En Java 21, un
 * hilo virtual que se bloquea dentro de un monitor <b>fija su hilo portador</b>: no se desmonta,
 * y ese hilo de plataforma queda inutilizable mientras dure el bloqueo. Como la carga hace una
 * llamada de red que puede tardar segundos, unas pocas cargas simultáneas bastan para clavar
 * todos los portadores del planificador y dejar la aplicación entera sin atender peticiones.
 *
 * <p>No es teoría. Con la caché sincrónica, la prueba de carga de 200 usuarios completó
 * <b>1 petición en 90 segundos</b>. La caché asíncrona guarda en el mapa un futuro —operación
 * inmediata, sin bloqueo bajo el monitor— y ejecuta la llamada fuera, en el ejecutor de hilos
 * virtuales: conserva la deduplicación y elimina la fijación. Con ella, la misma prueba pasa a
 * <b>16.400 peticiones a 272/s</b>, con mediana de 5,7 ms y ningún error.
 *
 * <p>Es también el motivo de que {@code similarIds} resuelva su valor con {@code join} sobre un
 * futuro en lugar de llamar directamente: quien decide si hay que ir al origen es la caché.
 *
 * <h2>Cortacircuitos por producto</h2>
 *
 * No se usa una librería de cortacircuitos. El motivo es que sus interruptores son por nombre, y
 * aquí el fallo es <b>por producto</b>: el producto 10000 tarda 50 segundos, pero el 100 responde
 * en uno. Un interruptor compartido abierto por el primero dejaría de servir el segundo, que está
 * perfectamente sano.
 *
 * <p>Lo que se hace es recordar los fallos con una expiración corta ({@link
 * ProductLookup.Unavailable}). El efecto es el de un cortacircuitos con la granularidad correcta:
 * el primer intento paga el tiempo de espera, y durante los segundos siguientes ese producto se
 * descarta al instante mientras el resto sigue atendiéndose con normalidad.
 */
@Component
public class ProductCatalog {

    private static final Logger log = LoggerFactory.getLogger(ProductCatalog.class);

    private static final ParameterizedTypeReference<List<String>> ID_LIST =
            new ParameterizedTypeReference<>() {
            };

    private final RestClient client;
    private final AsyncCache<String, ProductLookup> detailCache;
    private final AsyncCache<String, List<String>> similarIdsCache;

    public ProductCatalog(
            RestClient existingApiClient,
            ExecutorService productDetailExecutor,
            ExistingApiProperties properties) {
        this.client = existingApiClient;
        this.detailCache = Caffeine.newBuilder()
                .maximumSize(10_000)
                .expireAfter(new LookupExpiry(properties))
                .executor(productDetailExecutor)
                .buildAsync();
        this.similarIdsCache = Caffeine.newBuilder()
                .maximumSize(10_000)
                .expireAfterWrite(properties.successTtl())
                .executor(productDetailExecutor)
                .buildAsync();
    }

    /**
     * Identificadores de los productos similares, ordenados por similitud.
     *
     * @throws ProductNotFoundException si el producto de la petición no existe
     */
    public List<String> similarIds(String productId) {
        try {
            return load(similarIdsCache, productId, this::fetchSimilarIds).join();
        } catch (CompletionException e) {
            // Se desenvuelve para que el manejador de errores vea la excepción real y no el
            // envoltorio que añade el futuro.
            Throwable cause = e.getCause();
            throw cause instanceof RuntimeException runtime ? runtime : e;
        }
    }

    /**
     * Consulta el detalle de un producto.
     *
     * <p>Devuelve un futuro a propósito: quien llama pide varios detalles a la vez y decide
     * cuánto está dispuesto a esperar por el conjunto. Un método que devolviera el valor ya
     * resuelto obligaría a resolverlos de uno en uno.
     */
    public CompletableFuture<ProductLookup> lookupDetail(String productId) {
        return load(detailCache, productId, this::fetchDetail);
    }

    /**
     * Sirve el valor de la caché o lanza su carga en el ejecutor de hilos virtuales.
     *
     * <p>La función de carga solo <i>crea</i> el futuro, que es lo que se guarda en el mapa. El
     * trabajo de red ocurre después y fuera del monitor del mapa, que es justo lo que evita fijar
     * hilos portadores.
     */
    private static <T> CompletableFuture<T> load(
            AsyncCache<String, T> cache,
            String productId,
            java.util.function.Function<String, T> fetcher) {
        return cache.get(productId, (key, executor) ->
                CompletableFuture.supplyAsync(() -> fetcher.apply(key), executor));
    }

    private List<String> fetchSimilarIds(String productId) {
        try {
            List<String> ids = client.get()
                    .uri("/product/{productId}/similarids", productId)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (request, response) -> {
                        throw new ProductNotFoundException(productId);
                    })
                    .body(ID_LIST);
            return ids == null ? List.of() : ids;
        } catch (ProductNotFoundException e) {
            throw e;
        } catch (RuntimeException e) {
            // Un fallo al obtener la lista sí es un fallo de la petición: sin ella no hay nada
            // que devolver. Se propaga y el manejador de errores lo traduce a un 502.
            log.warn("No se han podido obtener los similares de {}: {}", productId, e.toString());
            throw new ExistingApiUnavailableException(productId, e);
        }
    }

    private ProductLookup fetchDetail(String productId) {
        try {
            ProductDetail detail = client.get()
                    .uri("/product/{productId}", productId)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (request, response) -> {
                        throw new ProductMissingSignal();
                    })
                    .body(ProductDetail.class);

            return detail == null ? new ProductLookup.Unavailable() : new ProductLookup.Found(detail);
        } catch (ProductMissingSignal e) {
            return new ProductLookup.Missing();
        } catch (RuntimeException e) {
            // Se registra en debug y no en warn a propósito: bajo carga, un origen caído
            // generaría miles de líneas por segundo y el propio registro se convertiría en el
            // cuello de botella.
            log.debug("El detalle del producto {} no está disponible: {}", productId, e.toString());
            return new ProductLookup.Unavailable();
        }
    }

    /** Señal interna para salir del callback de estado; no sale de esta clase. */
    private static final class ProductMissingSignal extends RuntimeException {
        private ProductMissingSignal() {
            super(null, null, false, false);
        }
    }

    /**
     * Expiración distinta según el desenlace.
     *
     * <p>Un producto encontrado se conserva minutos; que no exista se recuerda un rato porque es
     * estable; y un fallo se recuerda solo unos segundos, porque es transitorio y hay que darle
     * la oportunidad de recuperarse.
     */
    private record LookupExpiry(ExistingApiProperties properties)
            implements Expiry<String, ProductLookup> {

        private long ttlOf(ProductLookup lookup) {
            Duration ttl = switch (lookup) {
                case ProductLookup.Found ignored -> properties.successTtl();
                case ProductLookup.Missing ignored -> properties.missingTtl();
                case ProductLookup.Unavailable ignored -> properties.unavailableTtl();
            };
            return ttl.toNanos();
        }

        @Override
        public long expireAfterCreate(String key, ProductLookup value, long currentTime) {
            return ttlOf(value);
        }

        @Override
        public long expireAfterUpdate(
                String key, ProductLookup value, long currentTime, long currentDuration) {
            return ttlOf(value);
        }

        @Override
        public long expireAfterRead(
                String key, ProductLookup value, long currentTime, long currentDuration) {
            // La lectura no prolonga la vida de la entrada: el enunciado de la caché es
            // "cuánto tiempo puede estar desactualizado este dato", no "cuándo se usó".
            return currentDuration;
        }
    }
}
