package com.itx.similarproducts;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

import com.itx.similarproducts.config.ExistingApiProperties;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The figures the brief states as numbers.
 *
 * <p>Behaviour tests do not notice a number changing, because the behaviour is the same at any
 * number: the service still answers on 8080. The port is the clearest case — every other test here
 * runs on a random one so they can run in parallel, so <b>nothing ever ran against 5000</b>, the
 * port the exercise's load test targets. Getting it wrong would have surfaced as k6 failing to
 * connect, and not before.
 *
 * <p>The web environment is {@code NONE} on purpose: with no server started, nothing overrides the
 * configured value and what is asserted is what the configuration says.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class ConfigurationTest {

    @Autowired
    private Environment environment;

    @Autowired
    private ExistingApiProperties properties;

    @Test
    void the_service_listens_on_the_port_the_exercise_expects() {
        // The load test of the brief calls http://localhost:5000. Written out rather than read from
        // a constant: a test that takes the number from the same place as the code cannot notice
        // the number changing.
        assertThat(environment.getProperty("server.port")).isEqualTo("5000");
    }

    @Test
    void the_management_endpoints_listen_somewhere_else() {
        // Not merely "a different port": the whole point is that the public port serves the API and
        // nothing else, so this being equal to 5000 would undo it.
        assertThat(environment.getProperty("management.server.port"))
                .isEqualTo("5001")
                .isNotEqualTo(environment.getProperty("server.port"));
    }

    @Test
    void the_time_budget_and_the_expiries_are_the_ones_that_were_measured() {
        // The numbers the README defends with measurements. If one of them changes, the reasoning
        // published next to it stops being true, and this test is what says so out loud.
        assertThat(properties.fanOutTimeout()).isEqualTo(Duration.ofMillis(600));
        assertThat(properties.successTtl()).isEqualTo(Duration.ofMinutes(5));
        assertThat(properties.missingTtl()).isEqualTo(Duration.ofMinutes(1));
        assertThat(properties.unavailableTtl()).isEqualTo(Duration.ofSeconds(10));
        assertThat(properties.maxSimilarProducts()).isEqualTo(50);
    }

    @Test
    void virtual_threads_are_on() {
        // The decision the whole performance story rests on, and one line of configuration away
        // from being lost.
        assertThat(environment.getProperty("spring.threads.virtual.enabled")).isEqualTo("true");
    }
}
