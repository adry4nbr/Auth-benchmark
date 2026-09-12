package com.adryan.authbenchmark.backend_springboot.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RateLimitingFilterTest {

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    @Mock
    private FilterChain filterChain;

    private RateLimitingFilter filter;

    @BeforeEach
    void setUp() {
        filter = new RateLimitingFilter();
    }

    @Test
    void devePermitirAte5Requisicoes_doMesmoIp() throws ServletException, IOException {
        when(request.getRequestURI()).thenReturn("/auth/login");
        when(request.getRemoteAddr()).thenReturn("127.0.0.1");

        for (int i = 0; i < 5; i++) {
            filter.doFilterInternal(request, response, filterChain);
        }

        verify(filterChain, times(5)).doFilter(request, response);
        verify(response, never()).setStatus(429);
    }

    @Test
    void deveBloquearA6aRequisicao_doMesmoIp() throws ServletException, IOException {
        when(request.getRequestURI()).thenReturn("/auth/login");
        when(request.getRemoteAddr()).thenReturn("127.0.0.1");

        StringWriter stringWriter = new StringWriter();
        when(response.getWriter()).thenReturn(new PrintWriter(stringWriter));

        for (int i = 0; i < 5; i++) {
            filter.doFilterInternal(request, response, filterChain);
        }
        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain, times(5)).doFilter(request, response);
        verify(response).setStatus(429);
        assertTrue(stringWriter.toString().contains("Muitas tentativas"));
    }

    @Test
    void naoDeveLimitar_rotasQueNaoSaoSensiveis() throws ServletException, IOException {
        when(request.getRequestURI()).thenReturn("/auth/register");

        for (int i = 0; i < 6; i++) {
            filter.doFilterInternal(request, response, filterChain);
        }

        verify(filterChain, times(6)).doFilter(request, response);
        verify(response, never()).setStatus(429);
    }

    @Test
    void deveTratarIpsDiferentes_comLimitesIndependentes() throws ServletException, IOException {
        when(request.getRequestURI()).thenReturn("/auth/login");
        when(request.getRemoteAddr()).thenReturn("127.0.0.1");

        for (int i = 0; i < 5; i++) {
            filter.doFilterInternal(request, response, filterChain);
        }

        HttpServletRequest outroIp = mock(HttpServletRequest.class);
        when(outroIp.getRequestURI()).thenReturn("/auth/login");
        when(outroIp.getRemoteAddr()).thenReturn("192.168.0.1");

        filter.doFilterInternal(outroIp, response, filterChain);

        verify(filterChain, times(6)).doFilter(any(), eq(response));
        verify(response, never()).setStatus(429);
    }
}