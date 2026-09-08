package com.itx.similarproducts.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Ejecutor con el que se resuelven en paralelo los detalles de producto.
 *
 * <p>Es un único ejecutor compartido, y no uno creado por petición, por dos motivos. El menor es
 * no pagar la creación en cada llamada.
 *
 * <p>El importante es la semántica de {@code close()}: desde que {@link ExecutorService}
 * implementa {@code AutoCloseable}, cerrarlo dentro de un {@code try-with-resources} <b>espera a
 * que terminen todas las tareas</b>. Eso convertiría en inútil el presupuesto de tiempo de la
 * petición: tras descartar una llamada lenta, el cierre del ejecutor se quedaría esperándola
 * igualmente. Con un ejecutor compartido, la tarea abandonada se cancela y la petición responde.
 *
 * <p>Se destruye con {@code shutdownNow} en lugar de {@code shutdown} para que al parar la
 * aplicación no se quede esperando a las llamadas en vuelo.
 */
@Configuration
public class ExecutorConfig {

    @Bean(destroyMethod = "shutdownNow")
    ExecutorService productDetailExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
