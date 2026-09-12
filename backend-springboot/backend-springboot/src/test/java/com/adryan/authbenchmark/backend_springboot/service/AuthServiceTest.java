package com.adryan.authbenchmark.backend_springboot.service;

import com.adryan.authbenchmark.backend_springboot.dto.LoginResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.TwoFactorPendingResponseDto;
import com.adryan.authbenchmark.backend_springboot.dto.TwoFactorVerifiedResponseDto;
import com.adryan.authbenchmark.backend_springboot.exception.*;
import com.adryan.authbenchmark.backend_springboot.model.PasswordReset;
import com.adryan.authbenchmark.backend_springboot.model.RefreshToken;
import com.adryan.authbenchmark.backend_springboot.model.Role;
import com.adryan.authbenchmark.backend_springboot.model.User;
import com.adryan.authbenchmark.backend_springboot.repository.PasswordResetRepository;
import com.adryan.authbenchmark.backend_springboot.repository.RefreshTokenRepository;
import com.adryan.authbenchmark.backend_springboot.repository.UserRepository;
import com.adryan.authbenchmark.backend_springboot.util.InputSanitizer;
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

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @Mock
    private InputSanitizer inputSanitizer;

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
        when(inputSanitizer.sanitize("Novo Usuario")).thenReturn("Novo Usuario");
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

        TwoFactorVerifiedResponseDto result = authService.verifyTwoFactor(tempToken, codigoValido);

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

    // ---------- REFRESH TOKEN (dentro do login) ----------

    @Test
    void login_devePersistirRefreshToken_quandoCredenciaisValidasESem2FA() {
        when(userRepository.findByEmail("teste@teste.com")).thenReturn(Optional.of(existingUser));
        when(passwordEncoder.matches("senha123", "hash-fake")).thenReturn(true);

        Object result = authService.login("teste@teste.com", "senha123");

        assertInstanceOf(LoginResponseDto.class, result);
        LoginResponseDto response = (LoginResponseDto) result;
        assertNotNull(response.getRefreshToken());

        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).save(captor.capture());

        RefreshToken saved = captor.getValue();
        assertEquals(existingUser.getId(), saved.getUserId());
        assertTrue(saved.getExpiresAt().isAfter(java.time.LocalDateTime.now()));
        // O hash salvo nunca deve ser igual ao token puro devolvido ao cliente.
        assertNotEquals(response.getRefreshToken(), saved.getTokenHash());
    }

// ---------- REFRESH ----------

    @Test
    void refresh_deveRotacionarTokens_quandoRefreshTokenValido() {
        RefreshToken tokenAntigo = new RefreshToken();
        tokenAntigo.setUserId(existingUser.getId());
        tokenAntigo.setTokenHash("hash-antigo");
        tokenAntigo.setExpiresAt(java.time.LocalDateTime.now().plusDays(3));

        when(refreshTokenRepository.findByTokenHashAndExpiresAtAfter(anyString(), any()))
                .thenReturn(Optional.of(tokenAntigo));
        when(userRepository.findById(existingUser.getId())).thenReturn(Optional.of(existingUser));

        LoginResponseDto result = authService.refresh("token-antigo-em-texto-puro");

        assertNotNull(result.getToken());
        assertNotNull(result.getRefreshToken());
        assertNotEquals("token-antigo-em-texto-puro", result.getRefreshToken());

        // O token antigo precisa ser removido (rotação).
        verify(refreshTokenRepository).delete(tokenAntigo);
        // Um novo token precisa ser persistido.
        verify(refreshTokenRepository).save(any(RefreshToken.class));
    }

    @Test
    void refresh_deveLancarExcecao_quandoTokenNaoExisteOuExpirado() {
        when(refreshTokenRepository.findByTokenHashAndExpiresAtAfter(anyString(), any()))
                .thenReturn(Optional.empty());

        assertThrows(InvalidRefreshTokenException.class, () ->
                authService.refresh("token-invalido")
        );

        verify(refreshTokenRepository, never()).delete(any());
        verify(refreshTokenRepository, never()).save(any());
    }

    @Test
    void refresh_deveLancarExcecao_quandoUsuarioDoTokenNaoExisteMais() {
        RefreshToken token = new RefreshToken();
        UUID idDeUsuarioRemovido = UUID.randomUUID();
        token.setUserId(idDeUsuarioRemovido);
        token.setTokenHash("hash-qualquer");
        token.setExpiresAt(java.time.LocalDateTime.now().plusDays(3));

        when(refreshTokenRepository.findByTokenHashAndExpiresAtAfter(anyString(), any()))
                .thenReturn(Optional.of(token));
        when(userRepository.findById(idDeUsuarioRemovido)).thenReturn(Optional.empty());

        assertThrows(InvalidRefreshTokenException.class, () ->
                authService.refresh("token-de-usuario-removido")
        );
    }

// ---------- LOGOUT ----------

    @Test
    void logout_deveChamarDeleteByTokenHash() {
        authService.logout("meu-refresh-token");

        // Não testamos o valor exato do hash aqui (seria reimplementar SHA-256 no teste),
        // apenas que o método correto foi chamado exatamente uma vez.
        verify(refreshTokenRepository, times(1)).deleteByTokenHash(anyString());
    }

    @Test
    void logout_naoDeveLancarExcecao_mesmoSeTokenNaoExistir() {
        doNothing().when(refreshTokenRepository).deleteByTokenHash(anyString());

        assertDoesNotThrow(() -> authService.logout("token-que-nao-existe"));
    }

    // ---------- GOOGLE OAUTH ----------

    @Test
    void loginWithGoogle_deveLancarExcecao_quandoTokenMalformado() {
        // Testamos aqui o cenário real que encontramos em desenvolvimento:
        // um token que não é sequer um JWT bem-formado faz a biblioteca do Google
        // lançar IllegalArgumentException, que precisa ser capturada e convertida
        // em uma exceção de negócio, não vazar como erro genérico.
        ReflectionTestUtils.setField(authService, "googleClientId", "algum-client-id-de-teste");

        assertThrows(InvalidGoogleTokenException.class, () ->
                authService.loginWithGoogle("token-completamente-invalido")
        );
    }

    @Test
    void loginWithGoogle_deveLancarExcecao_quandoTokenVazio() {
        ReflectionTestUtils.setField(authService, "googleClientId", "algum-client-id-de-teste");

        assertThrows(InvalidGoogleTokenException.class, () ->
                authService.loginWithGoogle("")
        );
    }

    /*
     * NOTA: o caminho de sucesso (token Google válido, criação/recuperação de usuário
     * e emissão do access token) não é coberto por teste unitário porque exigiria
     * um idToken real emitido pelo Google para o Client ID configurado, ou mockar
     * classes finais/concretas da biblioteca google-api-client de forma frágil.
     * Esse cenário é validado manualmente via Google OAuth Playground ou durante
     * a integração com o frontend Angular — decisão registrada conscientemente,
     * não uma lacuna esquecida.
     */
}