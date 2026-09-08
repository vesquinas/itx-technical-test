package com.itx.similarproducts.service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
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
 * <h2>En paralelo, no en serie</h2>
 *
 * Es la decisión que más pesa. Obtener los detalles uno detrás de otro hace que la latencia sea
 * la <b>suma</b> de todas las llamadas; hacerlo en paralelo la deja en el <b>máximo</b>. Con los
 * retardos del simulador de la prueba (100 ms, 1 s y 5 s para un mismo producto) la diferencia
 * es de más de seis segundos a cinco.
 *
 * <p>Cada detalle se resuelve en un hilo virtual. No hay que dimensionar ningún pool: crear
 * cientos de hilos virtuales es barato y ninguno consume un hilo del sistema operativo mientras
 * espera una respuesta de red. Quien lanza esas cargas es la caché, que además garantiza que dos
 * peticiones simultáneas del mismo producto se resuelvan con una sola llamada al origen.
 *
 * <h2>Resultados parciales antes que ningún resultado</h2>
 *
 * Hay un presupuesto de tiempo para toda la petición, y es corto. Lo que no llega dentro de él
 * se omite de esta respuesta. El motivo es que un solo producto lento no debe decidir la latencia
 * de la respuesta entera: en la prueba de carga hay un producto que tarda 50 segundos, y
 * esperarlo significaría dejar colgadas las peticiones de todos los usuarios.
 *
 * <p>Se omiten igualmente los similares que no existen (404) y los que fallan. El contrato define
 * una lista de similares, y que uno de ellos haya desaparecido del catálogo no invalida los demás.
 *
 * <h2>La llamada descartada NO se cancela</h2>
 *
 * Esto es lo que más cambió las mediciones. Al agotarse el presupuesto se deja de esperar, pero
 * la llamada sigue su curso: cuando termine, dejará el producto en la caché y la siguiente
 * petición lo servirá al instante. Cancelarla, que fue la primera versión, tiraba justamente el
 * trabajo que iba a acelerar las peticiones siguientes, y así cada ciclo volvía a pagar la espera.
 *
 * <p>El coste de no cancelar está acotado por dos lados: por el límite de tiempo de lectura del
 * cliente HTTP, y porque la carga de la caché es atómica por clave, de modo que nunca hay más de
 * una llamada en vuelo por producto, por muchas peticiones simultáneas que lo pidan.
 *
 * <p>El presupuesto corto es además lo que acota la cola de latencias: en la prueba de carga de
 * la propia prueba (200 usuarios, cinco escenarios), el percentil 95 medido es de 1,51 s, es
 * decir, el propio presupuesto. Son las peticiones que caen en la ventana en la que un producto
 * lento todavía no está cacheado.
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
        // `LinkedHashSet` cumple dos requisitos del contrato de una vez: la lista es de elementos
        // únicos y conserva el orden de similitud que informa la API.
        List<String> ids = List.copyOf(new LinkedHashSet<>(catalog.similarIds(productId)));
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
