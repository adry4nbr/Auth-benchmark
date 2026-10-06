package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TotpServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private TotpService totpService;

    private final GoogleAuthenticator gAuth = new GoogleAuthenticator();
    private String secret;
    private UUID userId;
    private long fixedNowSeconds;
    private int currentStep;
    private int nextStep;

    @BeforeEach
    void setUp() {
        secret = gAuth.createCredentials().getKey();
        userId = UUID.randomUUID();
        fixedNowSeconds = 1700000000L;
        currentStep = (int) (fixedNowSeconds / 30L);
        nextStep = currentStep + 1;
    }

    @Test
    void verifyAndConsumeTotp_primeiroUsoCodigoValido_aceitoEGravaPasso() {
        int codeInt = gAuth.getTotpPassword(secret, fixedNowSeconds * 1000L);
        String codeStr = String.valueOf(codeInt);

        when(userRepository.updateTwoFactorLastStep(userId, currentStep)).thenReturn(1);

        boolean result = totpService.verifyAndConsumeTotp(userId, secret, codeStr, fixedNowSeconds);

        assertTrue(result);
        verify(userRepository).updateTwoFactorLastStep(userId, currentStep);
    }

    @Test
    void verifyAndConsumeTotp_segundoUsoMesmoCodigo_rejeitado() {
        int codeInt = gAuth.getTotpPassword(secret, fixedNowSeconds * 1000L);
        String codeStr = String.valueOf(codeInt);

        // Quando o passo já foi aceito anteriormente, a atualização condicional afeta 0 linhas
        when(userRepository.updateTwoFactorLastStep(userId, currentStep)).thenReturn(0);

        boolean result = totpService.verifyAndConsumeTotp(userId, secret, codeStr, fixedNowSeconds);

        assertFalse(result);
        verify(userRepository).updateTwoFactorLastStep(userId, currentStep);
    }

    @Test
    void verifyAndConsumeTotp_codigoPassoSeguinte_aceito() {
        long nextStepSec = fixedNowSeconds + 30L;
        int codeInt = gAuth.getTotpPassword(secret, nextStepSec * 1000L);
        String codeStr = String.valueOf(codeInt);

        when(userRepository.updateTwoFactorLastStep(userId, nextStep)).thenReturn(1);

        boolean result = totpService.verifyAndConsumeTotp(userId, secret, codeStr, nextStepSec);

        assertTrue(result);
        verify(userRepository).updateTwoFactorLastStep(userId, nextStep);
    }

    @Test
    void verifyAndConsumeTotp_codigoInvalido_rejeitadoSemGravar() {
        boolean result = totpService.verifyAndConsumeTotp(userId, secret, "000000", fixedNowSeconds);

        assertFalse(result);
        verify(userRepository, never()).updateTwoFactorLastStep(any(), anyInt());
    }
}
