package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.dto.PagedResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.exception.AutoExclusionException;
import com.adryan.authbenchmark.backend_springboot.exception.CannotDeleteAdminException;
import com.adryan.authbenchmark.backend_springboot.model.Role;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class AdminService {

    private final UserRepository userRepository;

    public AdminService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public PagedResponseDto<UserResponseDto> listUsers(int page, int limit) {
        Pageable pageable = PageRequest.of(page - 1, limit);
        Page<User> result = userRepository.findAll(pageable);

        List<UserResponseDto> data = result.getContent()
                .stream()
                .map(UserResponseDto::new)
                .toList();

        return new PagedResponseDto<>(
                data,
                result.getTotalElements(),
                result.getTotalPages(),
                page
        );
    }

    public void deleteUsers(UUID targetId, UUID requesterId){
        if(targetId.equals(requesterId)){
            throw new AutoExclusionException("Você não pode deletar sua própria conta");
        }

        User targetUser = userRepository.findById(targetId)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado"));

        if (targetUser.getRole() == Role.ADMIN) {
            throw new CannotDeleteAdminException("Não é possível deletar outro administrador");
        }

        userRepository.deleteById(targetId);
    }
}