package com.adryan.authbenchmark.backend_springboot.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "secret", "chave-de-teste-com-tamanho-minimo-de-32-caracteres");
        ReflectionTestUtils.setField(jwtService, "expiration", 3600000L);
    }

    @Test
    void generateToken_deveGerarTokenComClaimsCorretos() {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateToken(userId, "teste@teste.com", "ADMIN");

        assertEquals(userId.toString(), jwtService.extractSubject(token));
        assertEquals("ADMIN", jwtService.extractRole(token));
        assertFalse(jwtService.isTokenExpired(token));
    }

    @Test
    void generateTempToken_deveConterStageCorreto() {
        UUID userId = UUID.randomUUID();
        String tempToken = jwtService.generateTempToken(userId);

        assertEquals("2fa-pending", jwtService.extractStage(tempToken));
        assertEquals(userId.toString(), jwtService.extractSubject(tempToken));
    }
}