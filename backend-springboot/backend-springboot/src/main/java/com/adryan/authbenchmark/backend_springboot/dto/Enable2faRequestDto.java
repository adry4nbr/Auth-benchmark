package com.adryan.authbenchmark.backend_springboot.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class Enable2faRequestDto {
    @NotBlank(message = "O código é obrigatório")
    private String code;
}