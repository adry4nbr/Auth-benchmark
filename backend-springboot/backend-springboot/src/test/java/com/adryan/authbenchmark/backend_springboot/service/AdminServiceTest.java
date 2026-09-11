package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.dto.PagedResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.exception.AutoExclusionException;
import com.adryan.authbenchmark.backend_springboot.exception.CannotDeleteAdminException;
import com.adryan.authbenchmark.backend_springboot.model.Role;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private AdminService adminService;

    private User admin;
    private User commonUser;

    @BeforeEach
    void setUp() {
        admin = new User();
        admin.setId(UUID.randomUUID());
        admin.setRole(Role.ADMIN);

        commonUser = new User();
        commonUser.setId(UUID.randomUUID());
        commonUser.setRole(Role.USER);
    }

    @Test
    void listUsers_deveRetornarPaginaDeUsuarios() {
        Page<User> pageFalsa = new PageImpl<>(List.of(admin, commonUser));
        when(userRepository.findAll(any(Pageable.class))).thenReturn(pageFalsa);

        PagedResponseDto<UserResponseDto> result = adminService.listUsers(1, 10);

        assertEquals(2, result.getData().size());
        assertEquals(1, result.getCurrentPage());
    }

    @Test
    void deleteUsers_deveLancarExcecao_quandoTentaDeletarASiMesmo() {
        assertThrows(AutoExclusionException.class, () ->
                adminService.deleteUsers(admin.getId(), admin.getId())
        );

        verify(userRepository, never()).deleteById(any());
    }

    @Test
    void deleteUsers_deveLancarExcecao_quandoAlvoEhAdmin() {
        UUID requesterId = UUID.randomUUID();
        when(userRepository.findById(admin.getId())).thenReturn(Optional.of(admin));

        assertThrows(CannotDeleteAdminException.class, () ->
                adminService.deleteUsers(admin.getId(), requesterId)
        );

        verify(userRepository, never()).deleteById(any());
    }

    @Test
    void deleteUsers_deveDeletar_quandoAlvoEhUsuarioComum() {
        UUID requesterId = admin.getId();
        when(userRepository.findById(commonUser.getId())).thenReturn(Optional.of(commonUser));

        adminService.deleteUsers(commonUser.getId(), requesterId);

        verify(userRepository).deleteById(commonUser.getId());
    }
}