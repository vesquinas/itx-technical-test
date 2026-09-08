package com.itx.similarproducts.catalog;

/**
 * La API existente no ha podido atender la consulta de productos similares.
 *
 * <p>Se traduce a un 502: el fallo no es de quien llama ni de este servicio, sino de una
 * dependencia. Devolver un 500 haría parecer que el error es nuestro, y un 200 con la lista
 * vacía mentiría diciendo que ese producto no tiene similares.
 */
public class ExistingApiUnavailableException extends RuntimeException {

    public ExistingApiUnavailableException(String productId, Throwable cause) {
        super("La API existente no ha respondido a los similares de " + productId, cause);
    }
}
