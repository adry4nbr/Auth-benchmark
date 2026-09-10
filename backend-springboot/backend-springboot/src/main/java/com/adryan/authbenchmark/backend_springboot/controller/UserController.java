package com.adryan.authbenchmark.backend_springboot.controller;

import com.adryan.authbenchmark.backend_springboot.dto.Enable2faRequestDto;
import com.adryan.authbenchmark.backend_springboot.dto.TwoFactorSetupResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.service.UserService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/user")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/profile")
    public UserResponseDto profile() {
        UUID userId = getAuthenticatedUserId();
        return userService.getProfile(userId);
    }

    @PostMapping("/2fa/setup")
    public TwoFactorSetupResponseDto setupTwoFactor() {
        UUID userId = getAuthenticatedUserId();
        return userService.setupTwoFactor(userId);
    }

    @PostMapping("/2fa/enable")
    public void enableTwoFactor(@Valid @RequestBody Enable2faRequestDto request) {
        UUID userId = getAuthenticatedUserId();
        userService.enableTwoFactor(userId, request.getCode());
    }

    private UUID getAuthenticatedUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String userId = (String) authentication.getPrincipal();
        return UUID.fromString(userId);
    }
}