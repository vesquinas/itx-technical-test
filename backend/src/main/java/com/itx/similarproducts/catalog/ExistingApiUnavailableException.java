package com.itx.similarproducts.catalog;

/**
 * The existing API could not serve the similar-products lookup.
 *
 * <p>It translates to a 502: the failure belongs neither to the caller nor to this service, but to
 * a dependency. Returning a 500 would suggest the error is ours, and a 200 with an empty list would
 * lie by claiming the product has no similar products.
 *
 * <p>It carries no cause, and that is a consequence of caching the outcome: the failure is recorded
 * as a value ({@link Lookup.Unavailable}) so it can be remembered, and a value carries no stack
 * trace. The original exception is logged where it happens, in {@link ProductCatalog}, which is also
 * the only place where it is of any use.
 */
public class ExistingApiUnavailableException extends RuntimeException {

    public ExistingApiUnavailableException(String productId) {
        super("The existing API did not answer the similar products of " + productId);
    }
}
