package com.adryan.authbenchmark.backend_springboot.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class InputSanitizerTest {

    private final InputSanitizer sanitizer = new InputSanitizer();

    @Test
    void sanitize_deveRemoverTagScript() {
        String input = "<script>alert('xss')</script>Maria";
        String result = sanitizer.sanitize(input);

        assertFalse(result.contains("<script>"));
        assertTrue(result.contains("Maria"));
    }

    @Test
    void sanitize_deveManterTextoSimples_semAlteracao() {
        String input = "João da Silva";
        assertEquals("João da Silva", sanitizer.sanitize(input));
    }

    @Test
    void sanitize_deveRetornarNull_quandoInputForNull() {
        assertNull(sanitizer.sanitize(null));
    }

    @Test
    void sanitize_deveRemoverAtributosMaliciosos() {
        String input = "<img src=x onerror=\"alert('xss')\">";
        String result = sanitizer.sanitize(input);

        assertFalse(result.contains("onerror"));
    }
}