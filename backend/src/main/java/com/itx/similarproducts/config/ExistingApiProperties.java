package com.itx.similarproducts.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration of the existing API this service consumes.
 *
 * <p>The values live in {@code application.yaml} rather than being hard-coded: the timeouts are
 * exactly what you want to be able to tune without recompiling when the source's behaviour changes.
 *
 * @param baseUrl            root of the existing API
 * @param connectTimeout     limit for establishing the connection
 * @param readTimeout        limit for receiving the response of one call
 * @param fanOutTimeout      total budget for resolving every detail of one request
 * @param successTtl         how long a found product is kept in the cache
 * @param missingTtl         how long the absence of a product is remembered
 * @param unavailableTtl     how long a failed or timed-out product is remembered
 * @param maxSimilarProducts cap on the similar products resolved per request
 */
@ConfigurationProperties(prefix = "existing-api")
public record ExistingApiProperties(
        String baseUrl,
        Duration connectTimeout,
        Duration readTimeout,
        Duration fanOutTimeout,
        Duration successTtl,
        Duration missingTtl,
        Duration unavailableTtl,
        int maxSimilarProducts) {
}
