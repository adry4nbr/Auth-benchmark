package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class TotpService {

    private final UserRepository userRepository;
    private final GoogleAuthenticator gAuth;

    public TotpService(UserRepository userRepository) {
        this.userRepository = userRepository;
        this.gAuth = new GoogleAuthenticator();
    }

    @Transactional
    public boolean verifyAndConsumeTotp(UUID userId, String secret, String code, Long nowSeconds) {
        if (secret == null || code == null) {
            return false;
        }

        int codeInt;
        try {
            codeInt = Integer.parseInt(code.trim());
        } catch (NumberFormatException e) {
            return false;
        }

        long currentSec = (nowSeconds != null) ? nowSeconds : (System.currentTimeMillis() / 1000L);
        long currentStep = currentSec / 30L;
        long[] candidateSteps = new long[]{ currentStep - 1, currentStep, currentStep + 1 };

        Long matchedStep = null;
        for (long step : candidateSteps) {
            long timeMs = step * 30000L;
            int expectedCode = gAuth.getTotpPassword(secret, timeMs);
            if (expectedCode == codeInt) {
                matchedStep = step;
                break;
            }
        }

        if (matchedStep == null) {
            return false;
        }

        int updatedRows = userRepository.updateTwoFactorLastStep(userId, matchedStep.intValue());
        return updatedRows == 1;
    }

    @Transactional
    public boolean verifyAndConsumeTotp(UUID userId, String secret, String code) {
        return verifyAndConsumeTotp(userId, secret, code, null);
    }
}
