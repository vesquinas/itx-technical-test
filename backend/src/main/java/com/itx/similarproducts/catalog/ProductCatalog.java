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
 * Access to the existing API, with caching.
 *
 * <p>The cache does two jobs: it avoids repeating calls that are already resolved and, above all,
 * it <b>deduplicates</b>, because it stores the in-flight call and not just its result. Two hundred
 * simultaneous requests for the same product produce a single call to the source.
 *
 * <p><b>It has to be an {@link AsyncCache} and not the synchronous variant.</b> The synchronous one
 * runs its loading function inside a {@code synchronized} block of {@code ConcurrentHashMap}, and in
 * Java 21 a virtual thread blocked inside a monitor pins its carrier thread. With network calls
 * taking seconds, a handful of loads pins the whole scheduler: measured, the load test went from
 * completing <b>1 request in 90 seconds</b> to 16,400 at 272/s with this change alone. Do not go
 * back to the synchronous cache.
 *
 * <p>Failures are remembered with a short expiry ({@link ProductLookup.Unavailable}), which works as
 * a circuit breaker with per-product granularity. The full reasoning, and why no circuit-breaker
 * library is used, is in the README.
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
     * Identifiers of the similar products, ordered by similarity.
     *
     * @throws ProductNotFoundException if the requested product does not exist
     */
    public List<String> similarIds(String productId) {
        try {
            return load(similarIdsCache, productId, this::fetchSimilarIds).join();
        } catch (CompletionException e) {
            // Unwrapped so the error handler sees the real exception and not the wrapper the future
            // adds.
            Throwable cause = e.getCause();
            throw cause instanceof RuntimeException runtime ? runtime : e;
        }
    }

    /**
     * Looks a product's detail up.
     *
     * <p>It returns a future on purpose: the caller asks for several details at once and decides how
     * long it is willing to wait for the set. A method returning the resolved value would force
     * resolving them one at a time.
     */
    public CompletableFuture<ProductLookup> lookupDetail(String productId) {
        return load(detailCache, productId, this::fetchDetail);
    }

    /**
     * Serves the value from the cache or starts its load on the virtual-thread executor.
     *
     * <p>The loading function only <i>creates</i> the future, and the future is what gets stored in
     * the map. The network work happens afterwards and outside the map's monitor, which is exactly
     * what avoids pinning carrier threads.
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
                    // ONLY a 404 means "this product does not exist". A 429 or a 403 are problems of
                    // the dependency, and turning them into a 404 would tell the client the product
                    // does not exist when what happened is that we could not ask. Every other error
                    // falls through to the default handler, which throws, and is turned into a 502
                    // in the catch below.
                    .onStatus(status -> status.value() == 404, (request, response) -> {
                        throw new ProductNotFoundException(productId);
                    })
                    .body(ID_LIST);
            return normalize(productId, ids);
        } catch (ProductNotFoundException e) {
            throw e;
        } catch (RuntimeException e) {
            // Failing to obtain the list *is* a failure of the request: without it there is nothing
            // to return. It propagates and the error handler turns it into a 502.
            log.warn("Could not obtain the similar products of {}: {}", productId, e.toString());
            throw new ExistingApiUnavailableException(productId, e);
        }
    }

    /**
     * Leaves the similar-ids list in a usable state before caching it.
     *
     * <p>It does three things, each answering a concrete problem:
     *
     * <ul>
     *   <li><b>Drops nulls and blank strings.</b> A {@code null} inside the JSON array arrives as a
     *       null list element, and {@code List.copyOf} rejects nulls with {@code
     *       NullPointerException}: a single null at the source brought the request down with a 500.
     *       A blank identifier would additionally produce a call to {@code /product/}.
     *   <li><b>Removes duplicates while preserving order</b>, which are the two things the contract
     *       asks of the list.
     *   <li><b>Caps the number of similar products.</b> Without it, one request to this service
     *       turns into as many calls to the source as the list has entries. That is an amplification
     *       the source decides, not us, and it is worth bounding. Since the list comes ordered by
     *       similarity, the trim keeps the closest matches.
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
            log.debug("The similar-ids list of {} was reduced from {} to {} identifiers",
                    productId, ids.size(), unique.size());
        }
        return List.copyOf(unique);
    }

    private ProductLookup fetchDetail(String productId) {
        try {
            ProductDetail detail = client.get()
                    .uri("/product/{productId}", productId)
                    .retrieve()
                    // Same as above: only a 404 means "does not exist". The difference matters
                    // because each case is cached for a different length of time, one minute versus
                    // ten seconds, and remembering a 429 for a minute prolongs the outage for no
                    // reason.
                    .onStatus(status -> status.value() == 404, (request, response) -> {
                        throw new ProductMissingSignal();
                    })
                    .body(ProductDetail.class);

            // A detail missing the fields the contract declares mandatory is not usable: returning
            // it would make us the origin of the breach for our own clients.
            return isUsable(detail)
                    ? new ProductLookup.Found(detail)
                    : new ProductLookup.Unavailable();
        } catch (ProductMissingSignal e) {
            return new ProductLookup.Missing();
        } catch (RuntimeException e) {
            // Logged at debug rather than warn on purpose: under load, a downed source would produce
            // thousands of lines per second and the logging itself would become the bottleneck.
            log.debug("The detail of product {} is unavailable: {}", productId, e.toString());
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

    /** Internal signal to break out of the status callback; it never leaves this class. */
    private static final class ProductMissingSignal extends RuntimeException {
        private ProductMissingSignal() {
            super(null, null, false, false);
        }
    }

    /**
     * A different expiry depending on the outcome.
     *
     * <p>A found product is kept for minutes; a product not existing is remembered for a while
     * because that is stable; and a failure is remembered for a few seconds only, because it is
     * transient and deserves the chance to recover.
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
            // Reading does not extend the entry's life: the question the cache answers is "how long
            // may this value be out of date", not "when was it last used".
            return currentDuration;
        }
    }
}
