package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.exception.EmailAlreadyExistsException;
import com.adryan.authbenchmark.backend_springboot.exception.PasswordMismatchException;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
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
}