package com.itx.similarproducts.web;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.itx.similarproducts.domain.ProductDetail;
import com.itx.similarproducts.service.SimilarProductsService;

/**
 * La operación acordada con las aplicaciones de front-end.
 *
 * <p>El controlador no hace más que delegar: no valida reglas de negocio, no compone datos y no
 * captura errores. Traducir excepciones a códigos HTTP es trabajo del manejador de errores, que
 * está en un solo sitio para que ninguna ruta se lo salte.
 */
@RestController
public class SimilarProductsController {

    private final SimilarProductsService service;

    public SimilarProductsController(SimilarProductsService service) {
        this.service = service;
    }

    @GetMapping("/product/{productId}/similar")
    public List<ProductDetail> getSimilarProducts(@PathVariable String productId) {
        return service.findSimilarProducts(productId);
    }
}
