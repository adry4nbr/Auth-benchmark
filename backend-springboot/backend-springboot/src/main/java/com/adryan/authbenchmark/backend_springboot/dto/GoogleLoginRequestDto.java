package com.adryan.authbenchmark.backend_springboot.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class GoogleLoginRequestDto {
    @NotBlank(message = "O idToken é obrigatório")
    private String idToken;
}