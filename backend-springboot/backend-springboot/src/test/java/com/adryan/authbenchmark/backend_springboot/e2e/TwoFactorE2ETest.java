package com.adryan.authbenchmark.backend_springboot.e2e;

import com.adryan.authbenchmark.backend_springboot.exception.InvalidTwoFactorCodeException;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import com.adryan.authbenchmark.backend_springboot.service.UserService;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import com.warrenstrange.googleauth.GoogleAuthenticatorKey;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
class TwoFactorE2ETest {

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final GoogleAuthenticator gAuth = new GoogleAuthenticator();

    private User criarUsuarioComSecret() {
        GoogleAuthenticatorKey key = gAuth.createCredentials();
        String secret = key.getKey();

        User user = new User();
        user.setName("Teste 2FA");
        user.setEmail("2fa-" + System.currentTimeMillis() + "@teste.com");
        user.setPassword(passwordEncoder.encode("senha12345"));
        user.setTwoFactorSecret(secret);

        return userRepository.save(user);
    }

    @Test
    void deveHabilitarDoisFatoresEPersistirPassoNoBanco() {
        User user = criarUsuarioComSecret();
        String secret = user.getTwoFactorSecret();

        long nowMs = System.currentTimeMillis();
        long nowSec = nowMs / 1000L;
        long currentStep = nowSec / 30L;
        int code = gAuth.getTotpPassword(secret, nowMs);

        userService.enableTwoFactor(user.getId(), String.valueOf(code), nowSec);

        User updated = userRepository.findById(user.getId()).orElseThrow();

        assertTrue(updated.isTwoFactorEnabled(),
                "twoFactorEnabled deve ser true apos enableTwoFactor");

        assertNotNull(updated.getTwoFactorLastStep(),
                "twoFactorLastStep NAO deve ser null apos enableTwoFactor");

        long registeredStep = updated.getTwoFactorLastStep();
        assertTrue(
                registeredStep == currentStep - 1 ||
                registeredStep == currentStep ||
                registeredStep == currentStep + 1,
                "twoFactorLastStep (" + registeredStep + ") deve corresponder ao passo TOTP usado"
        );
    }

    @Test
    void deveRejeitarReplayDoMesmoCodigo() {
        User user = criarUsuarioComSecret();
        String secret = user.getTwoFactorSecret();

        long nowMs = System.currentTimeMillis();
        long nowSec = nowMs / 1000L;
        int code = gAuth.getTotpPassword(secret, nowMs);
        String codeStr = String.valueOf(code);

        userService.enableTwoFactor(user.getId(), codeStr, nowSec);

        assertThrows(
                InvalidTwoFactorCodeException.class,
                () -> userService.enableTwoFactor(user.getId(), codeStr, nowSec),
                "Replay do mesmo codigo TOTP deve lancar InvalidTwoFactorCodeException"
        );
    }
}