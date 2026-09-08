package com.itx.similarproducts.domain;

import java.math.BigDecimal;

/**
 * Detalle de producto, tal y como lo define el contrato acordado.
 *
 * <p>El precio es {@link BigDecimal} y no {@code double}: con coma flotante binaria, 9.99 no se
 * representa de forma exacta y los importes acumulan desviaciones. En dinero eso no es
 * aceptable, aunque aquí el servicio solo lo transporte.
 *
 * @param id           identificador del producto
 * @param name         nombre comercial
 * @param price        precio
 * @param availability si está disponible
 */
public record ProductDetail(String id, String name, BigDecimal price, boolean availability) {
}
