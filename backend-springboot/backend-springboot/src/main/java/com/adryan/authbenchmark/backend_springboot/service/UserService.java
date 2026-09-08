package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public UserResponseDto getProfile(UUID userId){
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado"));
        return new  UserResponseDto(user);
    }
}
