package com.adryan.authbenchmark.backend_springboot.config;

import com.adryan.authbenchmark.backend_springboot.security.JwtAuthenticationFilter;
import com.adryan.authbenchmark.backend_springboot.security.RateLimitingFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
class SecurityConfigTest {

    @Mock
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Mock
    private RateLimitingFilter rateLimitingFilter;

    private SecurityConfig securityConfig;

    @BeforeEach
    void setUp() {
        securityConfig = new SecurityConfig(jwtAuthenticationFilter, rateLimitingFilter);
        ReflectionTestUtils.setField(securityConfig, "frontendUrl", "http://localhost:4200");
    }

    @Test
    void corsConfigurationSource_deveLiberarApenasAOrigemDoFrontend() {
        CorsConfigurationSource source = securityConfig.corsConfigurationSource();
        CorsConfiguration config = ((UrlBasedCorsConfigurationSource) source)
                .getCorsConfigurations()
                .get("/**");

        assertNotNull(config);
        assert config.getAllowedOrigins() != null;
        assertEquals(1, config.getAllowedOrigins().size());
        assertEquals("http://localhost:4200", config.getAllowedOrigins().getFirst());
    }

    @Test
    void corsConfigurationSource_devePermitirHeaderAuthorization() {
        CorsConfigurationSource source = securityConfig.corsConfigurationSource();
        CorsConfiguration config = ((UrlBasedCorsConfigurationSource) source)
                .getCorsConfigurations()
                .get("/**");

        assert config.getAllowedHeaders() != null;
        assertTrue(config.getAllowedHeaders().contains("Authorization"));
    }

    @Test
    void corsConfigurationSource_deveExigirCredenciais() {
        CorsConfigurationSource source = securityConfig.corsConfigurationSource();
        CorsConfiguration config = ((UrlBasedCorsConfigurationSource) source)
                .getCorsConfigurations()
                .get("/**");

        assertEquals(Boolean.TRUE, config.getAllowCredentials());
    }
}