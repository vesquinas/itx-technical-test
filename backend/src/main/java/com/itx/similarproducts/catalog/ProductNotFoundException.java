package com.itx.similarproducts.catalog;

/**
 * The requested product does not exist in the existing API.
 *
 * <p>It translates to a 404, as the contract states. Mind the distinction: this means <b>the
 * product being asked for</b> does not exist. One of its similar products not existing is not an
 * error of the request and does not produce a 404.
 */
public class ProductNotFoundException extends RuntimeException {

    public ProductNotFoundException(String productId) {
        super("Product " + productId + " does not exist");
    }
}
