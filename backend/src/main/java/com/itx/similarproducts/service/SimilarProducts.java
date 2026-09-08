package com.itx.similarproducts.service;

import java.util.List;

import com.itx.similarproducts.domain.ProductDetail;

/**
 * The similar products of one product, and whether the list is all of them.
 *
 * <p>The distinction matters to a caller and the response body cannot carry it: the agreed contract
 * defines the 200 body as a bare array, so there is nowhere to put a flag without breaking it.
 *
 * <p><b>Absent is not the same as unavailable.</b> A similar product that answers 404 is gone from
 * the catalogue: there is nothing more to fetch and the list is complete without it. A similar
 * product that timed out or failed might well exist, and the list is missing something. Only the
 * second case makes a response incomplete.
 *
 * @param products the details that could be resolved, in order of similarity
 * @param complete {@code false} when at least one similar product was left out because it could
 *                 not be fetched, rather than because it does not exist
 */
public record SimilarProducts(List<ProductDetail> products, boolean complete) {
}
