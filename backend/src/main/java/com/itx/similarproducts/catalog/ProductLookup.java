package com.itx.similarproducts.catalog;

import com.itx.similarproducts.domain.ProductDetail;

/**
 * Outcome of looking a product up in the existing API.
 *
 * <p>It is modelled as a sealed type rather than returning {@code null} or throwing, because there
 * are <b>three</b> outcomes with different consequences and the caller should not be able to
 * conflate them:
 *
 * <ul>
 *   <li>{@link Found}: the product exists.
 *   <li>{@link Missing}: the API answers 404. That is a legitimate and stable answer, so it can be
 *       remembered for a while: the product is not going to appear out of nowhere.
 *   <li>{@link Unavailable}: the call failed or took too long. That is a transient state, so it is
 *       remembered for a few seconds only and then retried.
 * </ul>
 *
 * <p>That distinction is what allows giving each case its own cache expiry, which is the mechanism
 * that stops a product taking 50 seconds from punishing every subsequent request.
 */
public sealed interface ProductLookup {

    record Found(ProductDetail product) implements ProductLookup {
    }

    record Missing() implements ProductLookup {
    }

    record Unavailable() implements ProductLookup {
    }
}
