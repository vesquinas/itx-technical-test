package com.itx.similarproducts.web;

import java.util.List;

import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.itx.similarproducts.domain.ProductDetail;
import com.itx.similarproducts.service.SimilarProducts;
import com.itx.similarproducts.service.SimilarProductsService;

/**
 * The operation agreed with the front-end applications.
 *
 * <p>It delegates and shapes the response: it composes no data and catches no errors, because
 * translating exceptions into status codes belongs in one place no route can bypass.
 *
 * <p>Two things are its own. It <b>caps the size of the identifier</b>, which is forwarded to the
 * source and becomes a cache key: with the cap the ten thousand cache keys cannot hold more than
 * some 3 MB, without it the ceiling is the 8 KB the container accepts in a request line. It does
 * <b>not</b> bound the number of distinct identifiers, which is what evicts good entries — that
 * needs a per-client limit, on the README's list of what is undone. And it <b>says whether the
 * list is complete</b>, below.
 */
@RestController
public class SimilarProductsController {

    /** Generous next to any plausible identifier: a cap against abuse, not a business rule. */
    private static final int MAX_PRODUCT_ID_LENGTH = 128;

    /**
     * Tells the caller whether the list it just received is all of the similar products.
     *
     * <p>Without it, a caller that gets two products cannot tell "this product has two similar
     * products" from "we could not fetch the third". The information has to travel in a header
     * because the agreed contract defines the 200 body as a bare array, leaving nowhere to put a
     * flag: changing the body shape of an operation that was <i>agreed with the front-end
     * applications</i> is not a unilateral decision, and the contract file itself is part of the
     * test bench and kept unmodified. In a real project this would be the proposal to take to that
     * agreement.
     *
     * <p>A 206 would have been the obvious-looking answer and it is the wrong one: RFC 9110 defines
     * 206 as the response to a range request and requires a {@code Content-Range}. Sending it
     * without one is a protocol violation that confuses caches.
     *
     * <p>No {@code X-} prefix, per RFC 6648.
     */
    private static final String COMPLETE_HEADER = "Similar-Products-Complete";

    private final SimilarProductsService service;

    public SimilarProductsController(SimilarProductsService service) {
        this.service = service;
    }

    @GetMapping("/product/{productId}/similar")
    public ResponseEntity<List<ProductDetail>> getSimilarProducts(
            @PathVariable @Size(max = MAX_PRODUCT_ID_LENGTH) String productId) {
        SimilarProducts similar = service.findSimilarProducts(productId);

        ResponseEntity.BodyBuilder response = ResponseEntity.ok()
                .header(COMPLETE_HEADER, String.valueOf(similar.complete()));

        // An incomplete list is provisional: a later request may well return more. Letting a cache
        // keep it would freeze the gap for as long as it lived there.
        if (!similar.complete()) {
            response.cacheControl(CacheControl.noStore());
        }

        return response.body(similar.products());
    }
}
