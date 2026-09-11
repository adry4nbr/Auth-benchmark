package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.dto.TwoFactorSetupResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.UserResponseDto;
import com.adryan.authbenchmark.backend_springboot.exception.InvalidTwoFactorCodeException;
import com.adryan.authbenchmark.backend_springboot.exception.TwoFactorNotConfiguredException;
import com.adryan.authbenchmark.backend_springboot.model.Role;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    private User user;

    @BeforeEach
    void setUp() {
        user = new User();
        user.setId(UUID.randomUUID());
        user.setName("Usuario Teste");
        user.setEmail("teste@teste.com");
        user.setRole(Role.USER);
    }

    @Test
    void getProfile_deveRetornarDto_quandoUsuarioExiste() {
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));

        UserResponseDto result = userService.getProfile(user.getId());

        assertEquals(user.getEmail(), result.getEmail());
    }

    @Test
    void getProfile_deveLancarExcecao_quandoUsuarioNaoExiste() {
        UUID idInexistente = UUID.randomUUID();
        when(userRepository.findById(idInexistente)).thenReturn(Optional.empty());

        assertThrows(RuntimeException.class, () -> userService.getProfile(idInexistente));
    }

    @Test
    void setupTwoFactor_deveGerarSegredoEQrCode() {
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TwoFactorSetupResponseDto result = userService.setupTwoFactor(user.getId());

        assertNotNull(result.getManualEntryKey());
        assertTrue(result.getQrCodeDataUrl().startsWith("data:image/png;base64,"));
        verify(userRepository).save(any(User.class));
    }

    @Test
    void enableTwoFactor_deveAtivar2FA_quandoCodigoValido() {
        GoogleAuthenticator gAuth = new GoogleAuthenticator();
        String secret = gAuth.createCredentials().getKey();
        user.setTwoFactorSecret(secret);

        String codigoValido = String.valueOf(gAuth.getTotpPassword(secret));

        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        userService.enableTwoFactor(user.getId(), codigoValido);

        assertTrue(user.isTwoFactorEnabled());
    }

    @Test
    void enableTwoFactor_deveLancarExcecao_quandoNaoConfigurado() {
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));

        assertThrows(TwoFactorNotConfiguredException.class, () ->
                userService.enableTwoFactor(user.getId(), "123456")
        );
    }

    @Test
    void enableTwoFactor_deveLancarExcecao_quandoCodigoInvalido() {
        user.setTwoFactorSecret(new GoogleAuthenticator().createCredentials().getKey());
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));

        assertThrows(InvalidTwoFactorCodeException.class, () ->
                userService.enableTwoFactor(user.getId(), "000000")
        );
    }
}