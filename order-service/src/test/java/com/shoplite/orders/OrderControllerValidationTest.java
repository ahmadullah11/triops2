package com.shoplite.orders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;

/**
 * Contract tests for POST /orders validation. The controller is built directly
 * (standalone MockMvc) with a mocked JdbcTemplate, so no Spring context, no
 * database and no catalog/inventory calls are involved.
 */
class OrderControllerValidationTest {

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        JdbcTemplate db = Mockito.mock(JdbcTemplate.class);
        OrderController controller = new OrderController(
                db,
                RestClient.builder(),
                "http://catalog:3000",
                "http://inventory:8081");
        mvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void rejectsZeroQuantity() throws Exception {
        expectBadRequest("{\"productId\":1,\"quantity\":0}");
    }

    @Test
    void rejectsNegativeQuantity() throws Exception {
        expectBadRequest("{\"productId\":1,\"quantity\":-1}");
    }

    @Test
    void rejectsMissingQuantity() throws Exception {
        expectBadRequest("{\"productId\":1}");
    }

    @Test
    void rejectsMissingProductId() throws Exception {
        expectBadRequest("{\"quantity\":1}");
    }

    @Test
    void rejectsNonPositiveProductId() throws Exception {
        expectBadRequest("{\"productId\":0,\"quantity\":1}");
    }

    /**
     * A non-numeric value fails inside Jackson before the controller is invoked,
     * so only the status is asserted here. In the running application Spring
     * Boot's /error controller adds the JSON body we see in production.
     */
    @Test
    void rejectsNonNumericQuantity() throws Exception {
        mvc.perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":1,\"quantity\":\"abc\"}"))
                .andExpect(status().isBadRequest());
    }

    private void expectBadRequest(String json) throws Exception {
        mvc.perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }
}
