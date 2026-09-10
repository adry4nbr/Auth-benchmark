package com.adryan.authbenchmark.backend_springboot.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@AllArgsConstructor
public class TwoFactorSetupResponseDto {
    private String qrCodeDataUrl;
    private String manualEntryKey;
}