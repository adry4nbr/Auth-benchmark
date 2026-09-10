package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.dto.TwoFactorSetupResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.exception.InvalidTwoFactorCodeException;
import com.adryan.authbenchmark.backend_springboot.exception.TwoFactorNotConfiguredException;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import com.warrenstrange.googleauth.GoogleAuthenticatorKey;
import com.warrenstrange.googleauth.GoogleAuthenticatorQRGenerator;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.UUID;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final GoogleAuthenticator gAuth = new GoogleAuthenticator();

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public UserResponseDto getProfile(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado"));
        return new UserResponseDto(user);
    }

    public TwoFactorSetupResponseDto setupTwoFactor(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado"));

        GoogleAuthenticatorKey key = gAuth.createCredentials();
        String secret = key.getKey();

        String otpAuthUrl = GoogleAuthenticatorQRGenerator.getOtpAuthTotpURL("AuthBenchmark", user.getEmail(), key);
        String qrCodeDataUrl = generateQrCodeDataUrl(otpAuthUrl);

        user.setTwoFactorSecret(secret);
        userRepository.save(user);

        return new TwoFactorSetupResponseDto(qrCodeDataUrl, secret);
    }

    public void enableTwoFactor(UUID userId, String code) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado"));

        if (user.getTwoFactorSecret() == null) {
            throw new TwoFactorNotConfiguredException("2FA não foi configurado para este usuário.");
        }

        boolean isValid = gAuth.authorize(user.getTwoFactorSecret(), Integer.parseInt(code));

        if (!isValid) {
            throw new InvalidTwoFactorCodeException("Código de autenticação inválido.");
        }

        user.setTwoFactorEnabled(true);
        userRepository.save(user);
    }

    private String generateQrCodeDataUrl(String otpAuthUrl) {
        try {
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(otpAuthUrl, BarcodeFormat.QR_CODE, 200, 200);

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", outputStream);

            String base64 = Base64.getEncoder().encodeToString(outputStream.toByteArray());
            return "data:image/png;base64," + base64;
        } catch (Exception e) {
            throw new RuntimeException("Erro ao gerar QR code", e);
        }
    }
}