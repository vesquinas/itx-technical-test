package com.itx.similarproducts.catalog;

import com.itx.similarproducts.domain.ProductDetail;

/**
 * Resultado de consultar un producto en la API existente.
 *
 * <p>Se modela como tipo sellado en lugar de devolver {@code null} o lanzar una excepción
 * porque hay <b>tres</b> desenlaces con consecuencias distintas, y conviene que quien llame no
 * pueda confundirlos:
 *
 * <ul>
 *   <li>{@link Found}: el producto existe.
 *   <li>{@link Missing}: la API responde 404. Es una respuesta legítima y estable, así que se
 *       puede recordar un rato: ese producto no va a aparecer de golpe.
 *   <li>{@link Unavailable}: la llamada falló o tardó demasiado. Es un estado transitorio, así
 *       que se recuerda solo unos segundos y luego se vuelve a intentar.
 * </ul>
 *
 * <p>Esa distinción es la que permite dar a cada caso una expiración de caché propia, que es el
 * mecanismo con el que un producto que tarda 50 segundos deja de castigar a todas las
 * peticiones siguientes.
 */
public sealed interface ProductLookup {

    record Found(ProductDetail product) implements ProductLookup {
    }

    record Missing() implements ProductLookup {
    }

    record Unavailable() implements ProductLookup {
    }
}
