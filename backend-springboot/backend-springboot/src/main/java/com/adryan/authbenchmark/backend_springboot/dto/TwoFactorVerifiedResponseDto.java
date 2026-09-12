package com.adryan.authbenchmark.backend_springboot.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@AllArgsConstructor
public class TwoFactorVerifiedResponseDto {
    private String token;
    private UserResponseDto user;
}