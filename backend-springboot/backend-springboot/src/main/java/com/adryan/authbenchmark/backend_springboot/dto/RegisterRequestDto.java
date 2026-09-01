package com.adryan.authbenchmark.backend_springboot.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class RegisterRequestDto {

    private String name;
    private String email;
    private String password;
    private String confirmPassword;
}
