package com.itx.similarproducts.domain;

import java.math.BigDecimal;

/**
 * Product detail, as defined by the agreed contract.
 *
 * <p>The price is a {@link BigDecimal} and not a {@code double}: in binary floating point 9.99 has
 * no exact representation and amounts accumulate drift. That is not acceptable for money, even
 * though this service only carries it through.
 *
 * @param id           product identifier
 * @param name         commercial name
 * @param price        price
 * @param availability whether it is available
 */
public record ProductDetail(String id, String name, BigDecimal price, boolean availability) {
}
