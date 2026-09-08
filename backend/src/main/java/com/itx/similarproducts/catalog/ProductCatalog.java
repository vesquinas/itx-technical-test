package com.itx.similarproducts.catalog;

import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;

import com.github.benmanes.caffeine.cache.AsyncCache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Expiry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.itx.similarproducts.config.ExistingApiProperties;
import com.itx.similarproducts.domain.ProductDetail;

/**
 * Acceso a la API existente, con caché.
 *
 * <p>La caché hace dos trabajos: evita repetir llamadas ya resueltas y, sobre todo,
 * <b>deduplica</b>, porque guarda la llamada en curso y no solo su resultado. Doscientas
 * peticiones simultáneas del mismo producto generan una sola llamada al origen.
 *
 * <p><b>Tiene que ser {@link AsyncCache} y no la variante sincrónica.</b> La sincrónica ejecuta
 * su función de carga dentro de un bloque {@code synchronized} de {@code ConcurrentHashMap}, y
 * en Java 21 un hilo virtual bloqueado dentro de un monitor fija su hilo portador. Con llamadas
 * de red de varios segundos, unas pocas cargas clavan el planificador entero: medido, la prueba
 * de carga pasó de completar <b>1 petición en 90 segundos</b> a 16.400 a 272/s solo con este
 * cambio. No volver a la caché sincrónica.
 *
 * <p>Los fallos se recuerdan con expiración corta ({@link ProductLookup.Unavailable}), lo que
 * funciona como un cortacircuitos con granularidad por producto. El razonamiento completo, y por
 * qué no se usa una librería de cortacircuitos, está en el README.
 */
@Component
public class ProductCatalog {

    private static final Logger log = LoggerFactory.getLogger(ProductCatalog.class);

    private static final ParameterizedTypeReference<List<String>> ID_LIST =
            new ParameterizedTypeReference<>() {
            };

    private final RestClient client;
    private final int maxSimilarProducts;
    private final AsyncCache<String, ProductLookup> detailCache;
    private final AsyncCache<String, List<String>> similarIdsCache;

    public ProductCatalog(
            RestClient existingApiClient,
            ExecutorService productDetailExecutor,
            ExistingApiProperties properties) {
        this.client = existingApiClient;
        this.maxSimilarProducts = properties.maxSimilarProducts();
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
                    // SOLO el 404 significa "este producto no existe". Un 429 o un 403 son
                    // problemas de la dependencia, y traducirlos a 404 le diria al cliente que
                    // el producto no existe cuando lo que pasa es que no hemos podido preguntar.
                    // Los demas errores caen al manejador por omision, que lanza, y se traducen
                    // a 502 en el catch de abajo.
                    .onStatus(status -> status.value() == 404, (request, response) -> {
                        throw new ProductNotFoundException(productId);
                    })
                    .body(ID_LIST);
            return normalize(productId, ids);
        } catch (ProductNotFoundException e) {
            throw e;
        } catch (RuntimeException e) {
            // Un fallo al obtener la lista sí es un fallo de la petición: sin ella no hay nada
            // que devolver. Se propaga y el manejador de errores lo traduce a un 502.
            log.warn("No se han podido obtener los similares de {}: {}", productId, e.toString());
            throw new ExistingApiUnavailableException(productId, e);
        }
    }

    /**
     * Deja la lista de similares en un estado utilizable antes de cachearla.
     *
     * <p>Hace tres cosas, y las tres responden a un problema concreto:
     *
     * <ul>
     *   <li><b>Descarta nulos y cadenas vacías.</b> Un {@code null} dentro del array JSON llega
     *       como elemento nulo, y {@code List.copyOf} los rechaza con
     *       {@code NullPointerException}: un solo nulo en el origen tumbaba la petición con un
     *       500. Un identificador vacío, además, produciría una llamada a {@code /product/}.
     *   <li><b>Elimina duplicados conservando el orden</b>, que son los dos requisitos que el
     *       contrato pide de la lista.
     *   <li><b>Pone un tope al número de similares.</b> Sin él, una petición a este servicio se
     *       convierte en tantas llamadas al origen como elementos tenga la lista. Es una
     *       amplificación que decide el origen, no nosotros, y conviene acotarla. Como la lista
     *       viene ordenada por similitud, el recorte se queda con los más parecidos.
     * </ul>
     */
    private List<String> normalize(String productId, List<String> ids) {
        if (ids == null) {
            return List.of();
        }

        Set<String> unique = new LinkedHashSet<>();
        for (String id : ids) {
            if (id == null || id.isBlank()) {
                continue;
            }
            unique.add(id.trim());
            if (unique.size() == maxSimilarProducts) {
                break;
            }
        }

        if (unique.size() < ids.size()) {
            log.debug("La lista de similares de {} se ha reducido de {} a {} identificadores",
                    productId, ids.size(), unique.size());
        }
        return List.copyOf(unique);
    }

    private ProductLookup fetchDetail(String productId) {
        try {
            ProductDetail detail = client.get()
                    .uri("/product/{productId}", productId)
                    .retrieve()
                    // Igual que arriba: solo el 404 es "no existe". La diferencia importa porque
                    // cada caso se recuerda en cache un tiempo distinto, un minuto frente a diez
                    // segundos, y recordar un 429 durante un minuto alarga el corte innecesariamente.
                    .onStatus(status -> status.value() == 404, (request, response) -> {
                        throw new ProductMissingSignal();
                    })
                    .body(ProductDetail.class);

            // Un detalle sin los campos que el contrato declara obligatorios no es utilizable:
            // devolverlo nos convertiria en el origen del incumplimiento para nuestros clientes.
            return isUsable(detail)
                    ? new ProductLookup.Found(detail)
                    : new ProductLookup.Unavailable();
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

    private static boolean isUsable(ProductDetail detail) {
        return detail != null
                && detail.id() != null
                && !detail.id().isBlank()
                && detail.name() != null
                && detail.price() != null;
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
