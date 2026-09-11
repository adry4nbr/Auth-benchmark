package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.dto.LoginResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.TwoFactorPendingResponseDto;
import com.adryan.authbenchmark.backend_springboot.exception.EmailAlreadyExistsException;
import com.adryan.authbenchmark.backend_springboot.exception.InvalidResetTokenException;
import com.adryan.authbenchmark.backend_springboot.exception.LoginFailedException;
import com.adryan.authbenchmark.backend_springboot.exception.PasswordMismatchException;
import com.adryan.authbenchmark.backend_springboot.model.PasswordReset;
import com.adryan.authbenchmark.backend_springboot.model.Role;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.PasswordResetRepository;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private PasswordResetRepository passwordResetRepository;

    @InjectMocks
    private AuthService authService;

    private JwtService jwtService;
    private User existingUser;

    @BeforeEach
    void setUp() {
        // JwtService é uma classe real (não um mock), porque testar a geração
        // real do token nos dá mais confiança do que simular tudo.
        jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "secret", "chave-de-teste-com-tamanho-minimo-de-32-caracteres");
        ReflectionTestUtils.setField(jwtService, "expiration", 3600000L);
        ReflectionTestUtils.setField(authService, "jwtService", jwtService);

        existingUser = new User();
        existingUser.setId(UUID.randomUUID());
        existingUser.setName("Usuario Teste");
        existingUser.setEmail("teste@teste.com");
        existingUser.setPassword("hash-fake");
        existingUser.setRole(Role.USER);
    }

    // ---------- REGISTER ----------

    @Test
    void register_deveCriarUsuario_quandoDadosValidos() {
        when(userRepository.findByEmail("novo@teste.com")).thenReturn(Optional.empty());
        when(passwordEncoder.encode("senha123")).thenReturn("hash-gerado");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        User result = authService.register("Novo Usuario", "novo@teste.com", "senha123", "senha123");

        assertEquals("novo@teste.com", result.getEmail());
        assertEquals("hash-gerado", result.getPassword());
        verify(userRepository).save(any(User.class));
    }

    @Test
    void register_deveLancarExcecao_quandoSenhasDiferentes() {
        assertThrows(PasswordMismatchException.class, () ->
                authService.register("Nome", "email@teste.com", "senha123", "outraSenha")
        );

        // Garante que, se a senha já falhou, nem consultamos o banco.
        verifyNoInteractions(userRepository);
    }

    @Test
    void register_deveLancarExcecao_quandoEmailJaExiste() {
        when(userRepository.findByEmail("teste@teste.com")).thenReturn(Optional.of(existingUser));

        assertThrows(EmailAlreadyExistsException.class, () ->
                authService.register("Nome", "teste@teste.com", "senha123", "senha123")
        );

        verify(userRepository, never()).save(any());
    }

    // ---------- LOGIN ----------

    @Test
    void login_deveRetornarToken_quandoCredenciaisValidasESem2FA() {
        when(userRepository.findByEmail("teste@teste.com")).thenReturn(Optional.of(existingUser));
        when(passwordEncoder.matches("senha123", "hash-fake")).thenReturn(true);

        Object result = authService.login("teste@teste.com", "senha123");

        assertInstanceOf(LoginResponseDto.class, result);
        LoginResponseDto response = (LoginResponseDto) result;
        assertNotNull(response.getToken());
        assertEquals("teste@teste.com", response.getUser().getEmail());
    }

    @Test
    void login_deveRetornarPendencia2FA_quandoUsuarioTem2FAAtivado() {
        existingUser.setTwoFactorEnabled(true);
        when(userRepository.findByEmail("teste@teste.com")).thenReturn(Optional.of(existingUser));
        when(passwordEncoder.matches("senha123", "hash-fake")).thenReturn(true);

        Object result = authService.login("teste@teste.com", "senha123");

        assertInstanceOf(TwoFactorPendingResponseDto.class, result);
        TwoFactorPendingResponseDto response = (TwoFactorPendingResponseDto) result;
        assertTrue(response.isRequiresTwoFactor());
        assertNotNull(response.getTempToken());
    }

    @Test
    void login_deveLancarExcecao_quandoEmailNaoExiste() {
        when(userRepository.findByEmail("naoexiste@teste.com")).thenReturn(Optional.empty());

        assertThrows(LoginFailedException.class, () ->
                authService.login("naoexiste@teste.com", "qualquerSenha")
        );
    }

    @Test
    void login_deveLancarExcecao_quandoSenhaIncorreta() {
        when(userRepository.findByEmail("teste@teste.com")).thenReturn(Optional.of(existingUser));
        when(passwordEncoder.matches("senhaErrada", "hash-fake")).thenReturn(false);

        assertThrows(LoginFailedException.class, () ->
                authService.login("teste@teste.com", "senhaErrada")
        );
    }

    @Test
    void login_devemTerMesmaMensagem_paraEmailInexistenteESenhaErrada() {
        // Este teste documenta explicitamente a proteção contra enumeração de usuários.
        when(userRepository.findByEmail("naoexiste@teste.com")).thenReturn(Optional.empty());
        LoginFailedException erroEmailInexistente = assertThrows(LoginFailedException.class, () ->
                authService.login("naoexiste@teste.com", "qualquer")
        );

        when(userRepository.findByEmail("teste@teste.com")).thenReturn(Optional.of(existingUser));
        when(passwordEncoder.matches("senhaErrada", "hash-fake")).thenReturn(false);
        LoginFailedException erroSenhaErrada = assertThrows(LoginFailedException.class, () ->
                authService.login("teste@teste.com", "senhaErrada")
        );

        assertEquals(erroEmailInexistente.getMessage(), erroSenhaErrada.getMessage());
    }

    // ---------- VERIFY 2FA ----------

    @Test
    void verifyTwoFactor_deveRetornarTokenCompleto_quandoCodigoValido() {
        String secret = new GoogleAuthenticator().createCredentials().getKey();
        existingUser.setTwoFactorSecret(secret);

        String tempToken = jwtService.generateTempToken(existingUser.getId());
        String codigoValido = String.valueOf(new GoogleAuthenticator().getTotpPassword(secret));

        when(userRepository.findById(existingUser.getId())).thenReturn(Optional.of(existingUser));

        LoginResponseDto result = authService.verifyTwoFactor(tempToken, codigoValido);

        assertNotNull(result.getToken());
        assertEquals(existingUser.getEmail(), result.getUser().getEmail());
    }

    @Test
    void verifyTwoFactor_deveLancarExcecao_quandoTokenNaoEhDeStagePendente() {
        // Gera um token comum (não temporário), que não deveria ser aceito aqui.
        String tokenNormal = jwtService.generateToken(existingUser.getId(), existingUser.getEmail(), "USER");

        assertThrows(LoginFailedException.class, () ->
                authService.verifyTwoFactor(tokenNormal, "123456")
        );
    }

    @Test
    void verifyTwoFactor_deveLancarExcecao_quandoCodigoInvalido() {
        String secret = new GoogleAuthenticator().createCredentials().getKey();
        existingUser.setTwoFactorSecret(secret);
        String tempToken = jwtService.generateTempToken(existingUser.getId());

        when(userRepository.findById(existingUser.getId())).thenReturn(Optional.of(existingUser));

        assertThrows(LoginFailedException.class, () ->
                authService.verifyTwoFactor(tempToken, "000000")
        );
    }

    // ---------- FORGOT PASSWORD ----------

    @Test
    void forgotPassword_deveCriarReset_quandoEmailExiste() {
        when(userRepository.findByEmail("teste@teste.com")).thenReturn(Optional.of(existingUser));
        when(passwordEncoder.encode(anyString())).thenReturn("hash-do-token");

        authService.forgotPassword("teste@teste.com");

        ArgumentCaptor<PasswordReset> captor = ArgumentCaptor.forClass(PasswordReset.class);
        verify(passwordResetRepository).save(captor.capture());

        PasswordReset saved = captor.getValue();
        assertEquals("teste@teste.com", saved.getEmail());
        assertEquals("hash-do-token", saved.getTokenHash());
        assertTrue(saved.getExpiresAt().isAfter(java.time.LocalDateTime.now()));
    }

    @Test
    void forgotPassword_naoDeveCriarReset_quandoEmailNaoExiste() {
        when(userRepository.findByEmail("naoexiste@teste.com")).thenReturn(Optional.empty());

        // Não deve lançar exceção nenhuma — comportamento silencioso por design (anti-enumeração)
        assertDoesNotThrow(() -> authService.forgotPassword("naoexiste@teste.com"));

        verify(passwordResetRepository, never()).save(any());
    }

// ---------- RESET PASSWORD ----------

    @Test
    void resetPassword_deveAtualizarSenha_quandoTokenValido() {
        PasswordReset reset = new PasswordReset();
        reset.setEmail(existingUser.getEmail());
        reset.setTokenHash("hash-armazenado");
        reset.setExpiresAt(java.time.LocalDateTime.now().plusMinutes(10));

        when(passwordResetRepository.findByExpiresAtAfter(any())).thenReturn(List.of(reset));
        when(passwordEncoder.matches("token-correto", "hash-armazenado")).thenReturn(true);
        when(userRepository.findByEmail(existingUser.getEmail())).thenReturn(Optional.of(existingUser));
        when(passwordEncoder.encode("novaSenha123")).thenReturn("hash-nova-senha");

        authService.resetPassword("token-correto", "novaSenha123");

        assertEquals("hash-nova-senha", existingUser.getPassword());
        verify(userRepository).save(existingUser);
        verify(passwordResetRepository).delete(reset);
    }

    @Test
    void resetPassword_deveLancarExcecao_quandoTokenNaoBateComNenhumHash() {
        PasswordReset reset = new PasswordReset();
        reset.setEmail(existingUser.getEmail());
        reset.setTokenHash("hash-armazenado");
        reset.setExpiresAt(java.time.LocalDateTime.now().plusMinutes(10));

        when(passwordResetRepository.findByExpiresAtAfter(any())).thenReturn(List.of(reset));
        when(passwordEncoder.matches("token-errado", "hash-armazenado")).thenReturn(false);

        assertThrows(InvalidResetTokenException.class, () ->
                authService.resetPassword("token-errado", "novaSenha123")
        );

        verify(userRepository, never()).save(any());
        verify(passwordResetRepository, never()).delete(any());
    }

    @Test
    void resetPassword_deveLancarExcecao_quandoNaoHaResetsNaoExpirados() {
        when(passwordResetRepository.findByExpiresAtAfter(any())).thenReturn(List.of());

        assertThrows(InvalidResetTokenException.class, () ->
                authService.resetPassword("qualquerToken", "novaSenha123")
        );
    }

    @Test
    void resetPassword_deveCompararTokenRecebido_naoASenhaNova() {
        // Este teste documenta explicitamente o bug que já foi corrigido:
        // a comparação deve usar o "token", nunca o "newPassword".
        PasswordReset reset = new PasswordReset();
        reset.setEmail(existingUser.getEmail());
        reset.setTokenHash("hash-do-token-real");
        reset.setExpiresAt(java.time.LocalDateTime.now().plusMinutes(10));

        when(passwordResetRepository.findByExpiresAtAfter(any())).thenReturn(List.of(reset));
        // O token bate com o hash armazenado...
        when(passwordEncoder.matches("token-real", "hash-do-token-real")).thenReturn(true);
        when(userRepository.findByEmail(existingUser.getEmail())).thenReturn(Optional.of(existingUser));
        when(passwordEncoder.encode(anyString())).thenReturn("hash-qualquer");

        // ... Mesmo que a nova senha seja um valor completamente diferente, isso não deve ser usado na comparação.
        assertDoesNotThrow(() -> authService.resetPassword("token-real", "senhaCompletamenteDiferente"));

        verify(passwordEncoder).matches("token-real", "hash-do-token-real");
        verify(passwordEncoder, never()).matches("senhaCompletamenteDiferente", "hash-do-token-real");
    }
}