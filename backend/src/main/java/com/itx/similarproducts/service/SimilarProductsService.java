package com.itx.similarproducts.service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.itx.similarproducts.catalog.ProductCatalog;
import com.itx.similarproducts.catalog.ProductLookup;
import com.itx.similarproducts.config.ExistingApiProperties;
import com.itx.similarproducts.domain.ProductDetail;

/**
 * Resuelve el detalle de los productos similares a uno dado.
 *
 * <p>Los detalles se piden <b>en paralelo</b>, cada uno en un hilo virtual: en serie la latencia
 * sería la suma de las llamadas y en paralelo es el máximo. Con los retardos del simulador
 * (100 ms, 1 s y 5 s para un mismo producto) la diferencia es de más de seis segundos a cinco.
 *
 * <p>Hay un presupuesto de tiempo corto para toda la petición, y lo que no llega dentro de él se
 * omite de la respuesta: un solo producto lento no debe decidir la latencia de la respuesta
 * entera. Se omiten igualmente los similares que no existen y los que fallan, porque que uno
 * haya desaparecido del catálogo no invalida los demás.
 *
 * <p><b>La llamada descartada no se cancela</b>, y esto es deliberado: sigue su curso y deja el
 * producto en la caché, así que las peticiones siguientes sí lo incluyen. Cancelarla —la primera
 * versión lo hacía— tira justamente el trabajo que iba a acelerar todo lo demás.
 *
 * <p>El razonamiento completo, con las mediciones que llevaron a elegir el presupuesto, está en
 * el README.
 */
@Service
public class SimilarProductsService {

    private static final Logger log = LoggerFactory.getLogger(SimilarProductsService.class);

    private final ProductCatalog catalog;
    private final Duration fanOutTimeout;

    public SimilarProductsService(ProductCatalog catalog, ExistingApiProperties properties) {
        this.catalog = catalog;
        this.fanOutTimeout = properties.fanOutTimeout();
    }

    /**
     * Detalle de los productos similares al indicado, en el mismo orden de similitud que informa
     * la API existente.
     *
     * @throws com.itx.similarproducts.catalog.ProductNotFoundException si el producto no existe
     */
    public List<ProductDetail> findSimilarProducts(String productId) {
        // La lista llega ya saneada del catálogo: sin nulos ni vacíos, sin duplicados, en orden
        // de similitud y acotada en número. Se normaliza allí y no aquí para que lo que se
        // cachea sea lo ya saneado, y para que el tope acote también lo que se guarda en memoria.
        List<String> ids = catalog.similarIds(productId);
        if (ids.isEmpty()) {
            return List.of();
        }

        // Pedir todos los detalles a la vez: lanzar la carga no bloquea, cada una devuelve su
        // futuro y la espera viene después.
        List<CompletableFuture<ProductLookup>> pending = ids.stream()
                .map(catalog::lookupDetail)
                .toList();

        return collectWithinBudget(productId, ids, pending);
    }

    /**
     * Recoge los resultados que lleguen dentro del presupuesto de tiempo.
     *
     * <p>El presupuesto es único para toda la petición y no por llamada: si el primer detalle
     * consume casi todo el tiempo, a los siguientes les queda poco, que es exactamente el
     * comportamiento que se quiere. Un límite por llamada permitiría que tres llamadas lentas
     * sumaran tres veces el límite.
     */
    private List<ProductDetail> collectWithinBudget(
            String productId, List<String> ids, List<CompletableFuture<ProductLookup>> pending) {

        Instant deadline = Instant.now().plus(fanOutTimeout);
        List<ProductDetail> products = new ArrayList<>(pending.size());

        for (int index = 0; index < pending.size(); index++) {
            CompletableFuture<ProductLookup> future = pending.get(index);
            long remainingMillis = Duration.between(Instant.now(), deadline).toMillis();

            try {
                ProductLookup lookup = future.get(Math.max(remainingMillis, 0), TimeUnit.MILLISECONDS);
                if (lookup instanceof ProductLookup.Found found) {
                    products.add(found.product());
                }
            } catch (TimeoutException e) {
                // Deliberadamente NO se cancela: que termine y deje el producto en la caché.
                // Esta respuesta va sin él, pero las siguientes lo tendrán.
                log.debug("Se agotó el presupuesto de {} esperando el detalle de {}",
                        productId, ids.get(index));
            } catch (InterruptedException e) {
                // Se restaura la marca de interrupción y se devuelve lo obtenido: tragarse la
                // interrupción impediría que el servidor apagara la petición al cerrarse.
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                log.debug("Falló el detalle de {}: {}", ids.get(index), e.toString());
            }
        }

        return List.copyOf(products);
    }
}
