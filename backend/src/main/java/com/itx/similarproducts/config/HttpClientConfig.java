package com.itx.similarproducts.config;

import java.net.http.HttpClient;
import java.util.concurrent.Executors;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Cliente HTTP hacia la API existente.
 *
 * <p>Tres decisiones que importan bajo carga:
 *
 * <ol>
 *   <li><b>Hilos virtuales para las respuestas.</b> El cliente HTTP del JDK necesita un
 *       ejecutor para completar las peticiones; con hilos virtuales, cada llamada en vuelo
 *       cuesta unos cientos de bytes en lugar del megabyte de pila de un hilo de plataforma.
 *       Es lo que permite tener cientos de llamadas concurrentes sin dimensionar un pool.
 *   <li><b>HTTP/1.1 explícito.</b> Por defecto el cliente intenta HTTP/2, y contra un servidor
 *       en claro que solo habla HTTP/1.1 eso gasta un viaje de ida y vuelta en un intento de
 *       actualización de protocolo que va a fracasar. El simulador de la prueba es uno de
 *       esos servidores.
 *   <li><b>Límites de tiempo separados.</b> Conectar y leer son fallos distintos: una conexión
 *       rechazada se sabe al instante, mientras que un origen lento puede tardar lo que quiera.
 * </ol>
 */
@Configuration
public class HttpClientConfig {

    @Bean
    RestClient existingApiClient(ExistingApiProperties properties) {
        HttpClient httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(properties.connectTimeout())
                .executor(Executors.newVirtualThreadPerTaskExecutor())
                .build();

        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(properties.readTimeout());

        return RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(requestFactory)
                .build();
    }
}
