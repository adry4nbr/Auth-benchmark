package com.adryan.authbenchmark.backend_springboot.controller;

import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.service.UserService;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        String userId = (String) authentication.getPrincipal();
        UUID id = UUID.fromString(userId);
        return userService.getProfile(id);
    }
}
