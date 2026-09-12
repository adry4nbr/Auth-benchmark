package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.dto.LoginResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.TwoFactorPendingResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.TwoFactorVerifiedResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.exception.*;
import com.adryan.authbenchmark.backend_springboot.model.PasswordReset;
import com.adryan.authbenchmark.backend_springboot.model.RefreshToken;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.PasswordResetRepository;
import com.adryan.authbenchmark.backend_springboot.repository.RefreshTokenRepository;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import com.adryan.authbenchmark.backend_springboot.util.InputSanitizer;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final GoogleAuthenticator googleAuthenticator = new GoogleAuthenticator();
    private final PasswordResetRepository passwordResetRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final InputSanitizer inputSanitizer;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder,  JwtService jwtService, PasswordResetRepository passwordResetRepository,  RefreshTokenRepository refreshTokenRepository, InputSanitizer inputSanitizer) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.passwordResetRepository = passwordResetRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.inputSanitizer = inputSanitizer;
    }

    public User register(String name, String email, String password, String confirmPassword){
        if(!password.equals(confirmPassword)){
            throw new PasswordMismatchException("As duas senhas precisam ser iguais.");
        }

        if(userRepository.findByEmail(email).isPresent()){
            throw new EmailAlreadyExistsException("Este email já está cadastrado.");
        }
        User user = new User();
        user.setName(inputSanitizer.sanitize(name));
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(password));

        return userRepository.save(user);
    }

    public Object login(String email, String password) {
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null || !passwordEncoder.matches(password, user.getPassword())) {
            throw new LoginFailedException("Credenciais inválidas");
        }

        if (user.isTwoFactorEnabled()) {
            String tempToken = jwtService.generateTempToken(user.getId());
            return new TwoFactorPendingResponseDto(true, tempToken);
        }

        String AccessToken = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole().name());

        byte[] randomBytes = new byte[40];
        new SecureRandom().nextBytes(randomBytes);
        String refreshToken = HexFormat.of().formatHex(randomBytes);
        String refreshTokenHash = hashToken(refreshToken);

        RefreshToken refreshTokenEntity = new RefreshToken();
        refreshTokenEntity.setTokenHash(refreshTokenHash);
        refreshTokenEntity.setUserId(user.getId());
        refreshTokenEntity.setExpiresAt(LocalDateTime.now().plusDays(7));
        refreshTokenRepository.save(refreshTokenEntity);

        return new LoginResponseDto(AccessToken, refreshToken, new UserResponseDto(user));
    }

    public TwoFactorVerifiedResponseDto verifyTwoFactor(String tempToken, String code) {
        String stage;
        String userId;

        try {
            stage = jwtService.extractStage(tempToken);
            userId = jwtService.extractSubject(tempToken);
        } catch (Exception e) {
            throw new LoginFailedException("Token temporário inválido ou expirado");
        }

        if (!"2fa-pending".equals(stage)) {
            throw new LoginFailedException("Token inválido para esta operação");
        }

        User user = userRepository.findById(UUID.fromString(userId)).orElse(null);
        if (user == null || user.getTwoFactorSecret() == null) {
            throw new LoginFailedException("Usuário inválido ou 2FA não configurado");
        }

        boolean isValid = googleAuthenticator.authorize(user.getTwoFactorSecret(), Integer.parseInt(code));
        if (!isValid) {
            throw new LoginFailedException("Código de autenticação inválido");
        }

        String accessToken = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole().name());
        return new TwoFactorVerifiedResponseDto(accessToken, new UserResponseDto(user));
    }

    public void forgotPassword(String email) {
        userRepository.findByEmail(email).ifPresent(user -> {
            byte[] randomBytes = new byte[32];
            new SecureRandom().nextBytes(randomBytes);
            String token = HexFormat.of().formatHex(randomBytes);
            String tokenHash = passwordEncoder.encode(token);

            PasswordReset passwordReset = new PasswordReset();
            passwordReset.setEmail(email);
            passwordReset.setTokenHash(tokenHash);
            passwordReset.setExpiresAt(LocalDateTime.now().plusMinutes(15));

            passwordResetRepository.save(passwordReset);

            System.out.println("Link de recuperação (simulado): http://localhost:4200/reset-password?token=" + token);
        });
    }

    public void resetPassword(String token, String newPassword) {
        List<PasswordReset> resets = passwordResetRepository.findByExpiresAtAfter(LocalDateTime.now());

        PasswordReset resetEncontrado = null;

        for(PasswordReset reset : resets){
            if(passwordEncoder.matches(token, reset.getTokenHash())){
                resetEncontrado = reset;
                break;
            }
        }

        if(resetEncontrado == null){
            throw new InvalidResetTokenException("Token inválido ou expirado");
        }

        User user = userRepository.findByEmail(resetEncontrado.getEmail())
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado"));

        String hashedPassword = passwordEncoder.encode(newPassword);
        user.setPassword(hashedPassword);
        userRepository.save(user);

        passwordResetRepository.delete(resetEncontrado);
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("Erro ao gerar hash do token", e);
        }
    }

    public LoginResponseDto refresh(String refreshTokenRecebido) {
        String tokenHash = hashToken(refreshTokenRecebido);

        RefreshToken tokenValido = refreshTokenRepository
                .findByTokenHashAndExpiresAtAfter(tokenHash, LocalDateTime.now())
                .orElseThrow(() -> new InvalidRefreshTokenException("Refresh token inválido"));

        User user = userRepository.findById(tokenValido.getUserId())
                .orElseThrow(() -> new InvalidRefreshTokenException("Usuário não encontrado"));

        refreshTokenRepository.delete(tokenValido);

        byte[] randomBytes = new byte[40];
        new SecureRandom().nextBytes(randomBytes);
        String novoRefreshToken = HexFormat.of().formatHex(randomBytes);
        String novoRefreshTokenHash = hashToken(novoRefreshToken);

        RefreshToken novoRefreshTokenEntity = new RefreshToken();
        novoRefreshTokenEntity.setTokenHash(novoRefreshTokenHash);
        novoRefreshTokenEntity.setUserId(user.getId());
        novoRefreshTokenEntity.setExpiresAt(LocalDateTime.now().plusDays(7));
        refreshTokenRepository.save(novoRefreshTokenEntity);

        String novoAccessToken = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole().name());

        return new LoginResponseDto(novoAccessToken, novoRefreshToken, new UserResponseDto(user));
    }

    @Transactional
    public void logout(String refreshTokenRecebido) {
        String tokenHash = hashToken(refreshTokenRecebido);
        refreshTokenRepository.deleteByTokenHash(tokenHash);
    }
}