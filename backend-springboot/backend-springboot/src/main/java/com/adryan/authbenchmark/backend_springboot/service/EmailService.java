package com.adryan.authbenchmark.backend_springboot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.List;
import java.util.Map;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private final RestClient rest = RestClient.create("https://api.brevo.com");

    @Value("${brevo.api-key:}")
    private String apiKey;

    @Value("${mail.from:}")
    private String from;

    public void send(String to, String subject, String html) {
        try {
            rest.post()
                    .uri("/v3/smtp/email")
                    .header("api-key", apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "sender", Map.of("name", "Auth Benchmark", "email", from),
                            "to", List.of(Map.of("email", to)),
                            "subject", subject,
                            "htmlContent", html))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            log.error("Falha ao enviar e-mail", e);
        }
    }
}