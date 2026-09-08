package com.itx.similarproducts;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.itx.similarproducts.catalog.ProductCatalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * What comes out when something breaks that nobody anticipated.
 *
 * <p>The other error paths are deliberate; this one is a bug, and it is the one that leaks, because
 * the default behaviour is to describe the failure. The catalogue is replaced by a double that
 * throws, which is the only honest way to reach the path.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UnexpectedErrorTest {

    private static final String INTERNAL_DETAIL = "/opt/app/secreto: connection string user=admin";

    @Autowired
    private TestRestTemplate restTemplate;

    @MockitoBean
    private ProductCatalog catalog;

    @Test
    void an_unexpected_failure_answers_500_without_describing_itself() {
        when(catalog.similarIds(anyString()))
                .thenThrow(new IllegalStateException(INTERNAL_DETAIL));

        ResponseEntity<String> response =
                restTemplate.getForEntity("/product/{id}/similar", String.class, "MARCAAAA");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody())
                .as("the exception message must not travel to the caller")
                .doesNotContain("secreto", "connection string", "IllegalStateException");
        assertThat(response.getBody())
                .as("nor must the path it sent")
                .doesNotContain("MARCAAAA");
        assertThat(response.getBody())
                .as("nor a stack trace")
                .doesNotContain("com.itx.similarproducts");
    }
}
