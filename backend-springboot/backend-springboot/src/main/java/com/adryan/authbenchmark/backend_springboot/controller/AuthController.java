package com.adryan.authbenchmark.backend_springboot.controller;

import com.adryan.authbenchmark.backend_springboot.dto.*;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;


@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public UserResponseDto register(@Valid @RequestBody RegisterRequestDto request) {
        User user = authService.register(request.getName(), request.getEmail(), request.getPassword(), request.getConfirmPassword());
        return new UserResponseDto(user);
    }

    @PostMapping("/login")
    public Object login(@Valid @RequestBody LoginRequestDto request) {
        return authService.login(request.getEmail(), request.getPassword());
    }

    @PostMapping("/2fa/verify")
    public LoginResponseDto verifyTwoFactor(@Valid @RequestBody Verify2faRequestDto request) {
        return authService.verifyTwoFactor(request.getTempToken(), request.getCode());
    }

    @PostMapping("/forgot-password")
    public Map<String, String> forgotPassword(@Valid @RequestBody ForgotPasswordRequestDto request) {
        authService.forgotPassword(request.getEmail());
        return Map.of("message", "Se o e-mail existir, um link de recuperação foi enviado.");
    }

    @PostMapping("/reset-password")
    public Map<String, String> resetPassword(@Valid @RequestBody ResetPasswordRequestDto request) {
        authService.resetPassword(request.getToken(), request.getNewPassword());
        return Map.of("message", "Senha atualizada com sucesso.");
    }
}
