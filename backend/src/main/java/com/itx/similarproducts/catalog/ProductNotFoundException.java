package com.itx.similarproducts.catalog;

/**
 * El producto por el que se pregunta no existe en la API existente.
 *
 * <p>Se traduce a un 404, como indica el contrato. Ojo con la distinción: esto es que <b>el
 * producto de la petición</b> no existe. Que uno de sus similares no exista no es un error de
 * la petición y no produce un 404.
 */
public class ProductNotFoundException extends RuntimeException {

    public ProductNotFoundException(String productId) {
        super("No existe el producto " + productId);
    }
}
