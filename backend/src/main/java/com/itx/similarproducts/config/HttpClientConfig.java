package com.itx.similarproducts.config;

import java.net.http.HttpClient;
import java.util.concurrent.Executors;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * HTTP client towards the existing API.
 *
 * <p>Three decisions that matter under load:
 *
 * <ol>
 *   <li><b>Virtual threads for the responses.</b> The JDK HTTP client needs an executor to complete
 *       requests; with virtual threads, every in-flight call costs a few hundred bytes instead of a
 *       platform thread's megabyte of stack. That is what allows hundreds of concurrent calls
 *       without sizing a pool.
 *   <li><b>HTTP/1.1 explicitly.</b> By default the client attempts HTTP/2, and against a cleartext
 *       server that only speaks HTTP/1.1 that spends a round trip on an upgrade attempt destined to
 *       fail. The test's mock service is one of those servers.
 *   <li><b>Separate timeouts.</b> Connecting and reading are different failures: a refused
 *       connection is known instantly, whereas a slow source can take as long as it likes.
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
