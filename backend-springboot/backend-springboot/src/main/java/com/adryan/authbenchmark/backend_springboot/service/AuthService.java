package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.dto.LoginResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.exception.EmailAlreadyExistsException;
import com.adryan.authbenchmark.backend_springboot.exception.LoginFailedException;
import com.adryan.authbenchmark.backend_springboot.exception.PasswordMismatchException;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder,  JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public User register(String name, String email, String password, String confirmPassword){
        if(!password.equals(confirmPassword)){
            throw new PasswordMismatchException("As duas senhas precisam ser iguais.");
        }

        if(userRepository.findByEmail(email).isPresent()){
            throw new EmailAlreadyExistsException("Este email já está cadastrado.");
        }
        User user = new User();
        user.setName(name);
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(password));

        return userRepository.save(user);
    }

    public LoginResponseDto login(String email, String password){
        User user = userRepository.findByEmail(email).orElse(null);
        if(user == null || !passwordEncoder.matches(password, user.getPassword())){
            throw new LoginFailedException("Credenciais inválidas");
        }

        String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole().name());

        return new LoginResponseDto(token, new UserResponseDto(user));
    }
}