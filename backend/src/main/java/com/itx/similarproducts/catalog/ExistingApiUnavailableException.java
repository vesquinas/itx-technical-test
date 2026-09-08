package com.itx.similarproducts.catalog;

/**
 * The existing API could not serve the similar-products lookup.
 *
 * <p>It translates to a 502: the failure belongs neither to the caller nor to this service, but to
 * a dependency. Returning a 500 would suggest the error is ours, and a 200 with an empty list would
 * lie by claiming the product has no similar products.
 */
public class ExistingApiUnavailableException extends RuntimeException {

    public ExistingApiUnavailableException(String productId, Throwable cause) {
        super("The existing API did not answer the similar products of " + productId, cause);
    }
}
