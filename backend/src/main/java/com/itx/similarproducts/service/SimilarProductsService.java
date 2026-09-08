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
 * Resolves the detail of the products similar to a given one.
 *
 * <p>The details are requested <b>in parallel</b>, each on a virtual thread: serially the latency
 * would be the sum of the calls, in parallel it is the maximum. With the mock's delays (100 ms, 1 s
 * and 5 s for the same product) that is the difference between more than six seconds and five.
 *
 * <p>There is a short time budget for the whole request, and whatever does not arrive within it is
 * left out of the response: a single slow product must not decide the latency of the entire
 * response. Similar products that do not exist and those that fail are left out too, because one of
 * them having disappeared from the catalogue does not invalidate the others.
 *
 * <p><b>The abandoned call is not cancelled</b>, and that is deliberate: it runs to completion and
 * leaves the product in the cache, so subsequent requests do include it. Cancelling it — the first
 * version did — throws away exactly the work that was about to speed everything else up.
 *
 * <p>Whatever gets left out is reported back: see {@link SimilarProducts}. A caller that receives
 * two products has no way of telling from the body whether that is all of them, and the agreed
 * contract leaves no room in the body to say so.
 *
 * <p>The full reasoning, with the measurements that led to the chosen budget, is in the README.
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
     * Detail of the products similar to the given one, in the same order of similarity the existing
     * API reports.
     *
     * @throws com.itx.similarproducts.catalog.ProductNotFoundException if the product does not exist
     */
    public SimilarProducts findSimilarProducts(String productId) {
        // The list arrives already sanitised from the catalogue: no nulls, no blanks, no duplicates,
        // in order of similarity and bounded in size. It is normalised there and not here so that
        // what gets cached is the sanitised version, and so that the cap also bounds what is held in
        // memory.
        List<String> ids = catalog.similarIds(productId);
        if (ids.isEmpty()) {
            return new SimilarProducts(List.of(), true);
        }

        // Ask for every detail at once: starting the load does not block, each one returns its
        // future and the waiting comes afterwards.
        List<CompletableFuture<ProductLookup>> pending = ids.stream()
                .map(catalog::lookupDetail)
                .toList();

        return collectWithinBudget(productId, ids, pending);
    }

    /**
     * Collects whatever arrives within the time budget.
     *
     * <p>The budget covers the whole request rather than each call: if the first detail eats almost
     * all of the time, the rest get very little, which is exactly the intended behaviour. A per-call
     * limit would let three slow calls add up to three times the limit.
     *
     * <p>The budget is also what fixes the service's worst case: no response can take longer than
     * it. Measured with the exercise's load test, the observed maximum is 649 ms for a 600 ms
     * budget. The requests that reach it are the ones landing in the window where a slow product is
     * not cached yet.
     */
    private SimilarProducts collectWithinBudget(
            String productId, List<String> ids, List<CompletableFuture<ProductLookup>> pending) {

        Instant deadline = Instant.now().plus(fanOutTimeout);
        List<ProductDetail> products = new ArrayList<>(pending.size());
        // Set when a similar product is left out because it could not be fetched. A 404 does not
        // count: that product is gone from the catalogue and there is nothing more to get.
        boolean missingSomething = false;

        for (int index = 0; index < pending.size(); index++) {
            CompletableFuture<ProductLookup> future = pending.get(index);
            long remainingMillis = Duration.between(Instant.now(), deadline).toMillis();

            try {
                ProductLookup lookup = future.get(Math.max(remainingMillis, 0), TimeUnit.MILLISECONDS);
                switch (lookup) {
                    case ProductLookup.Found found -> products.add(found.product());
                    case ProductLookup.Unavailable ignored -> missingSomething = true;
                    case ProductLookup.Missing ignored -> {
                        // Gone from the catalogue: the list is complete without it.
                    }
                }
            } catch (TimeoutException e) {
                // Deliberately NOT cancelled: let it finish and leave the product in the cache. This
                // response goes without it, but the next ones will have it.
                missingSomething = true;
                log.debug("The budget of {} ran out waiting for the detail of {}",
                        productId, ids.get(index));
            } catch (InterruptedException e) {
                // Restore the interrupt flag and return what was gathered: swallowing the interrupt
                // would prevent the server from shutting the request down on close.
                Thread.currentThread().interrupt();
                missingSomething = true;
                break;
            } catch (Exception e) {
                missingSomething = true;
                log.debug("The detail of {} failed: {}", ids.get(index), e.toString());
            }
        }

        return new SimilarProducts(List.copyOf(products), !missingSomething);
    }
}
