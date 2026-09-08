package com.itx.similarproducts.web;

import java.util.List;

import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.itx.similarproducts.domain.ProductDetail;
import com.itx.similarproducts.service.SimilarProductsService;

/**
 * The operation agreed with the front-end applications.
 *
 * <p>The controller does nothing but delegate: it does not compose data and it does not catch
 * errors. Translating exceptions into HTTP status codes is the error handler's job, and it lives in
 * a single place so that no route can bypass it.
 *
 * <p>The one thing it does do is <b>cap the size of the identifier</b>. Without that limit anyone
 * can ask for arbitrarily long identifiers, and each one is forwarded to the source and becomes a
 * new cache key. That is a convenient way to evict the good entries and to force one call to the
 * source per request received. Rejecting it here costs one annotation and keeps it from travelling
 * any deeper.
 */
@RestController
public class SimilarProductsController {

    /**
     * Generous compared with any plausible identifier: the ones in the real catalogue are a few
     * dozen characters long. It is a cap against abuse, not a business rule.
     */
    private static final int MAX_PRODUCT_ID_LENGTH = 128;

    private final SimilarProductsService service;

    public SimilarProductsController(SimilarProductsService service) {
        this.service = service;
    }

    @GetMapping("/product/{productId}/similar")
    public List<ProductDetail> getSimilarProducts(
            @PathVariable @Size(max = MAX_PRODUCT_ID_LENGTH) String productId) {
        return service.findSimilarProducts(productId);
    }
}
