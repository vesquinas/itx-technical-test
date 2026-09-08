package com.itx.similarproducts.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuración de la API existente que este servicio consume.
 *
 * <p>Los valores están en {@code application.yaml} y no incrustados en el código: los tiempos
 * de espera son justamente lo que hay que poder ajustar sin recompilar cuando cambia el
 * comportamiento del origen.
 *
 * @param baseUrl        raíz de la API existente
 * @param connectTimeout límite para establecer la conexión
 * @param readTimeout    límite para recibir la respuesta de una llamada
 * @param fanOutTimeout  presupuesto total para resolver todos los detalles de una petición
 * @param successTtl     cuánto se conserva en caché un producto encontrado
 * @param missingTtl     cuánto se recuerda que un producto no existe
 * @param unavailableTtl cuánto se recuerda que un producto falló o tardó demasiado
 */
@ConfigurationProperties(prefix = "existing-api")
public record ExistingApiProperties(
        String baseUrl,
        Duration connectTimeout,
        Duration readTimeout,
        Duration fanOutTimeout,
        Duration successTtl,
        Duration missingTtl,
        Duration unavailableTtl) {
}
