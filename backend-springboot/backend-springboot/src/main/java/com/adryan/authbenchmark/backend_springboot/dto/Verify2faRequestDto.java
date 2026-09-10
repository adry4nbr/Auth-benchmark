package com.adryan.authbenchmark.backend_springboot.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class Verify2faRequestDto {
    @NotBlank(message = "O token temporário é obrigatório")
    private String tempToken;

    @NotBlank(message = "O código é obrigatório")
    private String code;
}