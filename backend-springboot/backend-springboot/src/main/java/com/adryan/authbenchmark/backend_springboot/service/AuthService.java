package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.dto.LoginResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.TwoFactorPendingResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.exception.EmailAlreadyExistsException;
import com.adryan.authbenchmark.backend_springboot.exception.LoginFailedException;
import com.adryan.authbenchmark.backend_springboot.exception.PasswordMismatchException;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final GoogleAuthenticator googleAuthenticator = new GoogleAuthenticator();

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder,  JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public User register(String name, String email, String password, String confirmPassword){
        if(!password.equals(confirmPassword)){
            throw new PasswordMismatchException("As duas senhas precisam ser iguais.");
        }

        if(userRepository.findByEmail(email).isPresent()){
            throw new EmailAlreadyExistsException("Este email já está cadastrado.");
        }
        User user = new User();
        user.setName(name);
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

        String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole().name());
        return new LoginResponseDto(token, new UserResponseDto(user));
    }

    public LoginResponseDto verifyTwoFactor(String tempToken, String code) {
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
        return new LoginResponseDto(accessToken, new UserResponseDto(user));
    }
}