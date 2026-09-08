package com.itx.similarproducts.web;

import java.util.List;

import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.itx.similarproducts.domain.ProductDetail;
import com.itx.similarproducts.service.SimilarProductsService;

/**
 * La operación acordada con las aplicaciones de front-end.
 *
 * <p>El controlador no hace más que delegar: no compone datos y no captura errores. Traducir
 * excepciones a códigos HTTP es trabajo del manejador de errores, que está en un solo sitio para
 * que ninguna ruta se lo salte.
 *
 * <p>Lo único que sí hace es <b>acotar el tamaño del identificador</b>. Sin ese límite, cualquiera
 * puede pedir identificadores arbitrariamente largos, y cada uno se reenvía al origen y se
 * convierte en una clave de caché nueva. Es una vía cómoda para desalojar de la caché las entradas
 * buenas y para generar una llamada al origen por cada petición recibida. Rechazarlo aquí cuesta
 * una anotación y evita que llegue más adentro.
 */
@RestController
public class SimilarProductsController {

    /**
     * Holgado respecto a cualquier identificador plausible: los del catálogo real tienen unas
     * decenas de caracteres. Es un tope contra el abuso, no una regla de negocio.
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
