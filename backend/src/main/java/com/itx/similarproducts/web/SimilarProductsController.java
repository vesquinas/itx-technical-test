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
 * <p>The controller does nothing but delegate and shape the response: it does not compose data and
 * it does not catch errors. Translating exceptions into HTTP status codes is the error handler's
 * job, and it lives in a single place so that no route can bypass it.
 *
 * <p>It does two things of its own:
 *
 * <ol>
 *   <li><b>Caps the size of the identifier.</b> Every identifier that arrives is forwarded to the
 *       source and becomes a cache key, so its length is the length of something we store and
 *       something we send on. With the cap, the ten thousand entries of the cache cannot be made to
 *       hold more than about 3 MB of keys; without it, the ceiling is whatever the container
 *       accepts in a request line — 8 KB by default, which is 150 MB of keys. Rejecting it here
 *       costs one annotation.
 *
 *       <p><b>What it does not do</b> is bound the <i>number</i> of distinct identifiers, and that
 *       is what evicts the good entries: ten thousand short made-up identifiers do it just as well
 *       as long ones. This cap makes each abusive request cheap, not the campaign of them. The
 *       answer to that is a request limit per client, which belongs to the gateway rather than to
 *       this service, and the README lists it among the things left undone rather than
 *       implying it is solved here.
 *   <li><b>Says whether the list is complete</b>, see below.
 * </ol>
 */
@RestController
public class SimilarProductsController {

    /**
     * Generous compared with any plausible identifier: the ones in the real catalogue are a few
     * dozen characters long. It is a cap against abuse, not a business rule.
     */
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
