package com.itx.similarproducts.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The executor used to resolve product details in parallel.
 *
 * <p>It is one shared executor rather than one created per request, for two reasons. The lesser one
 * is not paying for the creation on every call.
 *
 * <p>The important one is the semantics of {@code close()}: since {@link ExecutorService} implements
 * {@code AutoCloseable}, closing it inside a {@code try-with-resources} <b>waits for every task to
 * finish</b>. That would defeat the request's time budget: after abandoning a slow call, closing the
 * executor would wait for it anyway. With a shared executor the request answers immediately and the
 * abandoned load finishes on its own, leaving the product in the cache.
 *
 * <p>It is destroyed with {@code shutdownNow} instead of {@code shutdown} so that stopping the
 * application does not wait for in-flight calls.
 */
@Configuration
public class ExecutorConfig {

    @Bean(destroyMethod = "shutdownNow")
    ExecutorService productDetailExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
