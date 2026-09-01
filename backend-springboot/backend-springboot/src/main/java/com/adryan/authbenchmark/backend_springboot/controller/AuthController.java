package com.adryan.authbenchmark.backend_springboot.controller;

import com.adryan.authbenchmark.backend_springboot.dto.RegisterRequestDto;
import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.service.AuthService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public UserResponseDto register(@RequestBody RegisterRequestDto request) {
        User user = authService.register(request.getName(), request.getEmail(), request.getPassword(), request.getConfirmPassword());
        return new UserResponseDto(user);
    }
}
