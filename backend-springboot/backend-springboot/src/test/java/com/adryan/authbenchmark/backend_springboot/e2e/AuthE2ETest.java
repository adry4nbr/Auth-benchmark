package com.adryan.authbenchmark.backend_springboot.e2e;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AuthE2ETest {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    private String baseUrl;
    private final String testEmail = "e2e-" + System.currentTimeMillis() + "@teste.com";
    private final String testPassword = "senha12345";

    @BeforeAll
    void setup() {
        baseUrl = "http://localhost:" + port + "/api/v1";
        registrarUsuarioDeTeste();
    }

    private void registrarUsuarioDeTeste() {
        Map<String, String> body = new HashMap<>();
        body.put("name", "Usuário E2E");
        body.put("email", testEmail);
        body.put("password", testPassword);
        body.put("confirmPassword", testPassword);

        ResponseEntity<Map> response = restTemplate.postForEntity(baseUrl + "/auth/register", body, Map.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testEmail, response.getBody().get("email"));
        assertEquals("USER", response.getBody().get("role"));
    }

    @Test
    @Order(1)
    void deveFazerLoginComCredenciaisCorretas() {
        Map<String, String> body = new HashMap<>();
        body.put("email", testEmail);
        body.put("password", testPassword);

        ResponseEntity<Map> response = restTemplate.postForEntity(baseUrl + "/auth/login", body, Map.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody().get("token"));
    }

    @Test
    @Order(2)
    void deveRejeitarLoginComSenhaErrada() {
        Map<String, String> body = new HashMap<>();
        body.put("email", testEmail);
        body.put("password", "senhaErrada");

        ResponseEntity<Map> response = restTemplate.postForEntity(baseUrl + "/auth/login", body, Map.class);

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
    }

    @Test
    @Order(3)
    void deveRejeitarAcessoAoPerfilSemToken() {
        // Diferença de comportamento documentada: Spring Security devolve 403
        // (não 401) para rota protegida sem token, por causa da ordem de filtros.
        ResponseEntity<Map> response = restTemplate.getForEntity(baseUrl + "/user/profile", Map.class);
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    @Order(4)
    void deveRetornarPerfilComTokenValido() {
        String token = fazerLoginERetornarToken(testEmail, testPassword);

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);

        ResponseEntity<Map> response = restTemplate.exchange(
                baseUrl + "/user/profile", HttpMethod.GET, new HttpEntity<>(headers), Map.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(testEmail, response.getBody().get("email"));
    }

    @Test
    @Order(5)
    void deveRejeitarUsuarioComumNaRotaDeAdmin() {
        String token = fazerLoginERetornarToken(testEmail, testPassword);

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);

        ResponseEntity<Map> response = restTemplate.exchange(
                baseUrl + "/admin/users", HttpMethod.GET, new HttpEntity<>(headers), Map.class);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    @Order(6)
    void devePermitirAdminAcessarListagemDeUsuarios() {
        String token = fazerLoginERetornarToken("admin@authbenchmark.com", "uma-senha-forte-aqui");

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);

        ResponseEntity<Map> response = restTemplate.exchange(
                baseUrl + "/admin/users", HttpMethod.GET, new HttpEntity<>(headers), Map.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    @Order(7)
    void deveBloquearAposExcederLimiteDeTentativasDeLogin() {
        String emailIsolado = "rate-limit-" + System.currentTimeMillis() + "@teste.com";

        Map<String, String> body = new HashMap<>();
        body.put("email", emailIsolado);
        body.put("password", "senhaErrada");

        @SuppressWarnings("unchecked")
        CompletableFuture<ResponseEntity<Map>>[] futures = new CompletableFuture[10];
        for (int i = 0; i < 10; i++) {
            futures[i] = CompletableFuture.supplyAsync(() ->
                    restTemplate.postForEntity(baseUrl + "/auth/login", body, Map.class));
        }
        CompletableFuture.allOf(futures).join();

        boolean algumBloqueado = false;
        for (CompletableFuture<ResponseEntity<Map>> future : futures) {
            if (future.join().getStatusCode() == HttpStatus.TOO_MANY_REQUESTS) {
                algumBloqueado = true;
                break;
            }
        }

        assertTrue(algumBloqueado, "Esperava que ao menos uma tentativa retornasse 429");
    }

    @Test
    @Order(8)
    void deveSepararContadoresDeRateLimitingPorIpAtrasDeProxy() {
        String emailIp1 = "rate-ip1-" + System.currentTimeMillis() + "@teste.com";
        String emailIp2 = "rate-ip2-" + System.currentTimeMillis() + "@teste.com";

        Map<String, String> bodyIp1 = new HashMap<>();
        bodyIp1.put("email", emailIp1);
        bodyIp1.put("password", "senhaErrada");

        HttpHeaders headersIp1 = new HttpHeaders();
        headersIp1.set("X-Forwarded-For", "203.0.113.10");
        HttpEntity<Map<String, String>> entityIp1 = new HttpEntity<>(bodyIp1, headersIp1);

        boolean algumBloqueado = false;
        for (int i = 0; i < 6; i++) {
            ResponseEntity<Map> response = restTemplate.exchange(
                    baseUrl + "/auth/login", HttpMethod.POST, entityIp1, Map.class);
            if (response.getStatusCode() == HttpStatus.TOO_MANY_REQUESTS) {
                algumBloqueado = true;
            }
        }
        assertTrue(algumBloqueado, "Esperava que ao menos uma tentativa com IP 203.0.113.10 retornasse 429");

        Map<String, String> bodyIp2 = new HashMap<>();
        bodyIp2.put("email", emailIp2);
        bodyIp2.put("password", "senhaErrada");

        HttpHeaders headersIp2 = new HttpHeaders();
        headersIp2.set("X-Forwarded-For", "203.0.113.20");
        HttpEntity<Map<String, String>> entityIp2 = new HttpEntity<>(bodyIp2, headersIp2);

        ResponseEntity<Map> responseIp2 = restTemplate.exchange(
                baseUrl + "/auth/login", HttpMethod.POST, entityIp2, Map.class);

        assertNotEquals(HttpStatus.TOO_MANY_REQUESTS, responseIp2.getStatusCode(), "IP diferente não deveria estar bloqueado");
        assertEquals(HttpStatus.UNAUTHORIZED, responseIp2.getStatusCode());
    }

    private String fazerLoginERetornarToken(String email, String password) {
        Map<String, String> body = new HashMap<>();
        body.put("email", email);
        body.put("password", password);

        ResponseEntity<Map> response = restTemplate.postForEntity(baseUrl + "/auth/login", body, Map.class);
        return (String) response.getBody().get("token");
    }
}