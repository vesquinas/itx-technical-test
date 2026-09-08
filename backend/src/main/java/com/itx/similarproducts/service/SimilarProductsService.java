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
import com.itx.similarproducts.catalog.Lookup;
import com.itx.similarproducts.config.ExistingApiProperties;
import com.itx.similarproducts.domain.ProductDetail;

/**
 * Resolves the detail of the products similar to a given one.
 *
 * <p>The details are requested <b>in parallel</b>, each on a virtual thread: serially the latency
 * is the sum of the calls, in parallel the maximum. With the mock's delays for one product — 100 ms,
 * 1 s, 5 s — that is six seconds against five.
 *
 * <p>A short budget covers the whole request and whatever misses it is left out, so one slow
 * product does not decide the latency of the response. <b>The abandoned call is not cancelled</b>:
 * it finishes and leaves the product in the cache, so the next request includes it. Cancelling —
 * the first version did — throws away the work that was about to make everything faster.
 *
 * <p>What was left out is reported back, see {@link SimilarProducts}: from a body of two products a
 * caller cannot tell whether that is all of them, and the agreed contract has nowhere to say so.
 *
 * <p>The measurements behind the budget are in the README.
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
        List<CompletableFuture<Lookup<ProductDetail>>> pending = ids.stream()
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
            String productId, List<String> ids, List<CompletableFuture<Lookup<ProductDetail>>> pending) {

        Instant deadline = Instant.now().plus(fanOutTimeout);
        List<ProductDetail> products = new ArrayList<>(pending.size());
        // Set when a similar product is left out because it could not be fetched. A 404 does not
        // count: that product is gone from the catalogue and there is nothing more to get.
        boolean missingSomething = false;

        for (int index = 0; index < pending.size(); index++) {
            CompletableFuture<Lookup<ProductDetail>> future = pending.get(index);
            long remainingMillis = Duration.between(Instant.now(), deadline).toMillis();

            try {
                Lookup<ProductDetail> lookup =
                        future.get(Math.max(remainingMillis, 0), TimeUnit.MILLISECONDS);
                switch (lookup) {
                    case Lookup.Found<ProductDetail> found -> products.add(found.value());
                    case Lookup.Unavailable<ProductDetail> ignored -> missingSomething = true;
                    case Lookup.Missing<ProductDetail> ignored -> {
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
