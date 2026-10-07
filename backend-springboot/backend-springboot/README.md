# Backend Spring Boot — Auth Benchmark

Este documento é um **tutorial passo a passo** de como este backend foi construído, na ordem real em que as decisões foram tomadas — incluindo os bugs genuínos encontrados no caminho (não uma versão "limpa" fictícia). O objetivo é permitir reproduzir o processo do zero, sem depender de memória, e servir de referência ao comparar com as implementações em NestJS e Laravel.

**API em produção:** `https://auth-benchmark-springboot.onrender.com/api/v1` (plano gratuito: o primeiro acesso pode levar até 1 minuto).

## Stack

- **Java 21**, **Spring Boot 4.1.1**, **Maven**
- **Spring Data JPA** (ORM) + **Hibernate 7.4.5**
- **PostgreSQL 16** (Docker no desenvolvimento, Neon em produção; banco próprio `authdb_springboot`)
- **Flyway** (migrations versionadas)
- **Spring Security** (filter chain customizada, sem sessão)
- **JJWT 0.13.0** (JWT)
- **Lombok** (redução de boilerplate)
- **GoogleAuth** (`com.warrenstrange:googleauth`) + **ZXing** (2FA/TOTP + QR code)
- **google-api-client** (login social Google)
- **OWASP Java HTML Sanitizer** (Anti-XSS)
- **Bucket4j** (Rate Limiting)
- **Brevo** via API HTTP, chamada com o `RestClient` do Spring (e-mail de recuperação de senha)
- **JUnit 5 + Mockito** (testes unitários)
- **Spring Boot Test / TestRestTemplate** (testes e2e)
- **Docker** + **Render** (deploy da API) + **Neon** (banco)

## Pré-requisitos

- Docker Desktop instalado e aberto
- JDK 21
- IntelliJ IDEA (Community já é suficiente)

---

## 1. Por que Spring Boot não é "NestJS em Java"

Antes de qualquer código, vale registrar a diferença de filosofia que guiou todas as decisões abaixo:

- **Inversão de Controle**: o Nest usa DI explícita via módulos (`@Module`); o Spring escaneia o classpath inteiro (`@ComponentScan`) e monta o grafo de dependências sozinho, sem listagem manual de providers.
- **"Seguro por padrão" vs "explícito por padrão"**: assim que a dependência `spring-boot-starter-security` entra no `pom.xml`, o Spring Boot **bloqueia todas as rotas automaticamente**, sem você pedir nada — o oposto do Nest, onde você aplica `@UseGuards()` explicitamente onde quiser proteção. Isso pegou a gente de surpresa na primeira vez que rodamos a aplicação após adicionar Security (ver seção 5).
- **Servlet Filter Chain vs Guards**: no Spring, autenticação/autorização acontece numa cadeia de `Filter`s de baixo nível (anterior ao roteamento do Spring MVC); no Nest, Guards rodam **depois** do roteamento já ter decidido qual handler tratar a requisição. Isso explica comportamentos que pareceriam bugs se comparados ingenuamente linha a linha com o Nest (ex: item 5.2).

---

## 2. Criando o projeto (Spring Initializr)

Gerado via [start.spring.io](https://start.spring.io): Maven, Java 21, Packaging Jar, dependências iniciais `Spring Web`, `Spring Data JPA`, `PostgreSQL Driver` (Security foi adicionado **depois**, deliberadamente, para entender o impacto de cada dependência isoladamente).

**Bug de nomenclatura de pasta:** o Artifact foi definido como `backend-springboot` para bater com a convenção de pastas já usada pelo `backend-nestjs` no mesmo monorepo — o Initializr converte hífen para underscore no nome do pacote Java gerado (`backend_springboot`), o que é esperado, não um erro. O projeto acabou ficando numa pasta aninhada (`backend-springboot/backend-springboot/`), o que importa no deploy (seção 14).

---

## 3. Primeiro `Run` — descobrindo o ciclo `src` → `target`

Diferente do Node (onde o `.ts`/`.js` roda quase diretamente), Java **nunca** executa o código-fonte — sempre o que foi compilado para `target/classes`. Isso gerou uma sequência de bugs reais, documentados aqui porque se repetiram várias vezes ao longo do projeto:

### 3.1 — Datasource não configurado

Primeira execução falhou com `Failed to determine a suitable driver class` — faltava o `application.properties` (equivalente ao `.env`, mas com convenção de chaves que o Spring já entende nativamente):

```properties
spring.datasource.url=jdbc:postgresql://localhost:5433/authdb_springboot
spring.datasource.username=admin
spring.datasource.password=admin
```

(Na versão final do projeto, esses valores vêm de variáveis de ambiente, com estes mesmos valores locais como padrão. Ver seção 14.)

**Bug bobo, mas real:** digitamos `JDBC:postgresql://...` (maiúsculo). O prefixo do schema da URL é _case-sensitive_ — `JDBC` maiúsculo não é reconhecido, gerando exatamente o mesmo erro de "driver não encontrado", mesmo com o driver já no classpath. Lição: o erro "driver não encontrado" não significa necessariamente "dependência faltando" — pode ser a URL malformada.

### 3.2 — `target/classes` desatualizado

Mesmo corrigindo o `application.properties`, o erro persistia **idêntico**. Causa: o IntelliJ rodou a aplicação sem recompilar o `resources` mais recente. `mvnw.cmd clean compile` também falhou (`Failed to delete ... -> [Help 1]`), porque um processo Java anterior ainda segurava arquivos do build antigo.

**Falsa pista perseguida:** inicialmente suspeitamos do OneDrive (o projeto estava em `Documentos`, sincronizado), e chegamos a recomendar mover o projeto para fora dele. **Isso estava errado.** A causa real era um `target/classes` corrompido por um `clean` anterior que falhou no meio do processo — apagar a pasta manualmente (`rmdir /s /q target`) resolveu, sem qualquer relação com OneDrive. Lição registrada: escalar para uma mudança estrutural grande (trocar de pasta/ambiente) antes de esgotar hipóteses locais e simples é um erro de processo de debugging, mesmo quando a hipótese parece plausível.

### 3.3 — `Unable to create tempDir` ao usar variáveis de ambiente no IntelliJ

Depois de mover os segredos para variáveis de ambiente, a aplicação passou a falhar no boot com `Unable to create tempDir. java.io.tmpdir is set to C:\WINDOWS\` (`AccessDeniedException`). O Tomcat precisa de uma pasta temporária, e o Java a descobre pelas variáveis de sistema `TEMP`/`TMP`. Ao preencher as variáveis de ambiente manualmente na Run Configuration **sem** marcar **Include system environment variables**, `TEMP` e `TMP` sumiram, e o Java caiu no fallback `C:\WINDOWS\`, onde não há permissão de escrita. Correção: marcar a opção. (Plano B: `-Djava.io.tmpdir=C:\Temp` nas VM options.)

---

## 4. Modelo de dados (JPA vs Prisma)

**Diferença de filosofia de ORM:** Prisma tem uma fonte de verdade declarativa própria (`schema.prisma`) com migrations geradas e versionadas explicitamente. JPA/Hibernate usa classes Java anotadas como fonte de verdade, com **duas opções**: deixar o Hibernate gerar/alterar o schema automaticamente (`ddl-auto=update`, usado inicialmente neste projeto, só durante o desenvolvimento) ou usar uma ferramenta de migration explícita (Flyway/Liquibase). Este projeto **migrou de `update` para Flyway** depois que o restante das funcionalidades já estava pronto (ver seção 11.1), replicando o rigor que o Nest já tinha desde o início com Prisma Migrate.

```java
@Entity
@Table(name = "users")
@DynamicUpdate
public class User {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false) private String name;
    @Column(nullable = false, unique = true) private String email;
    private String password; // nullable — contas Google não têm senha

    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private Role role = Role.USER;

    private String twoFactorSecret; // nullable
    @Column(nullable = false) private boolean twoFactorEnabled = false;
    private Integer twoFactorLastStep; // último passo TOTP aceito (seção 8)

    @CreationTimestamp @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
```

`@DynamicUpdate` é essencial por causa da proteção contra reuso do TOTP (seção 8): sem ele, o Hibernate gera um `UPDATE` com todas as colunas e pode sobrescrever o `twoFactorLastStep`.

**Diferença observada e registrada:** o Prisma define `role` como `String` livre; o Hibernate, ao mapear um `enum Role` com `@Enumerated(EnumType.STRING)`, gera automaticamente um **CHECK constraint** no banco (`role IN ('ADMIN','USER')`), impedindo fisicamente valores fora do enum — algo que o schema do Prisma, como está, não impõe no nível de banco.

**Banco isolado por backend, mesmo servidor:** decisão consciente (ver discussão no processo) — como o frontend Angular vai testar **um backend por vez** (nunca os três simultaneamente sob carga), não há necessidade de servidores Postgres totalmente separados por backend; bancos separados (`authdb`, `authdb_springboot`, `authdb_laravel`) no mesmo servidor já garantem isolamento de dados sem gastar mais recursos. O mesmo princípio foi repetido para o banco de teste e2e (seção 13.2): `authdb_springboot_test`, mesmo container, banco próprio. Em produção, o Neon hospeda os bancos `authdb` e `authdb_springboot` no mesmo projeto.

---

## 5. Spring Security — a peça mais diferente do Nest

Adicionar `spring-boot-starter-security` **bloqueou todas as rotas automaticamente**, incluindo `/auth/register` (esperado, ver seção 1). Configuração explícita necessária:

```java
@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .cors(cors -> cors.configurationSource(corsConfigurationSource()))
        .csrf(AbstractHttpConfigurer::disable)
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/auth/register", "/auth/login", "/auth/forgot-password",
                             "/auth/reset-password", "/auth/refresh", "/auth/logout",
                             "/auth/social/google", "/auth/2fa/verify").permitAll()
            .requestMatchers("/admin/**").hasRole("ADMIN")
            .anyRequest().authenticated()
        )
        .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .addFilterBefore(rateLimitingFilter, UsernamePasswordAuthenticationFilter.class)
        .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
}
```

`csrf().disable()` é uma decisão consciente, não um "desliga pra parar de dar erro": proteção CSRF do Spring é pensada para autenticação via cookie/sessão; usamos JWT stateless enviado explicitamente no header `Authorization`, vetor ao qual CSRF clássico não se aplica da mesma forma.

O `PasswordEncoder` é um bean `BCryptPasswordEncoder` (strength padrão, 10), usado tanto no cadastro quanto na verificação do login e dos tokens de recuperação.

**`/auth/2fa/verify` adicionada à lista de rotas públicas depois**, ao integrar com o frontend Angular: sem essa entrada, a rota caía na regra genérica `anyRequest().authenticated()`, e o `JwtAuthenticationFilter` barrava a requisição com `403` mesmo com um `tempToken` válido no corpo — o token intermediário de 2FA não é, e nunca foi pensado para ser, o mesmo tipo de credencial que o filtro JWT normal verifica no header `Authorization`.

### 5.1 — Bug: 403 mascarando erros reais (recorrente)

Padrão encontrado **três vezes** ao longo do projeto: uma exceção de negócio não tratada (`IllegalArgumentException` genérica) sobe até o container de servlets, que tenta fazer um _forward_ interno para `/error` — rota que **também passa pela filter chain** e é barrada pela regra `anyRequest().authenticated()`, mascarando o erro real (500) atrás de um **403 sem corpo nenhum**. Casos concretos:

1. Email duplicado no registro, antes de existir um `@RestControllerAdvice`.
2. Google OAuth: `GoogleIdTokenVerifier.verify()` lança `IllegalArgumentException` para tokens malformados — tipo não capturado pelo `catch (GeneralSecurityException | IOException e)` original.
3. Nome vazio depois da sanitização (seção 12): a primeira versão lançava `IllegalArgumentException`.

**Lição geral:** um `403` sem mensagem nenhuma no Spring Security quase sempre significa "algo quebrou antes/durante, e o `/error` foi bloqueado" — não necessariamente "sem permissão". Investigar sempre pelo log do console, nunca só pelo status HTTP.

**Solução estrutural:** `@RestControllerAdvice` central (`GlobalExceptionHandler`), com um `@ExceptionHandler` por tipo de exceção customizada, e `@ExceptionHandler(MethodArgumentNotValidException.class)` para erros de Bean Validation — nunca deixar exceção de negócio subir crua.

**Armadilha:** para resolver o nome vazio, uma primeira versão adicionou um handler para `IllegalArgumentException` genérica, respondendo `400` com `ex.getMessage()`. Isso é largo demais: **qualquer** `IllegalArgumentException` da aplicação ou de uma biblioteca passaria a responder `400` com mensagem interna (por exemplo `Invalid UUID string: ...`), vazando detalhe. A correção foi seguir o padrão do projeto, uma exceção própria por caso: `InvalidNameException`, com um handler dedicado que devolve `400`.

### 5.2 — Diferença de contrato registrada (não corrigida, documentada)

Testado empiricamente: chamar uma rota `/admin/**` **sem token nenhum** retorna `403` no Spring (o `AnonymousAuthenticationFilter` preenche o contexto com uma autenticação "anônima" válida, sem authorities — tecnicamente autenticado, apenas sem permissão), enquanto o `JwtAuthGuard` do Nest (via Passport) retorna `401` no mesmo cenário. Decisão: manter a diferença, documentar no benchmark como comportamento padrão divergente entre frameworks, não "bug" de nenhum dos dois lados. **Confirmado novamente pelo teste e2e** (seção 13.2), que espera `403` explicitamente nesse cenário em vez de forçar uma paridade artificial com o Nest.

| Cenário                   | NestJS | Spring Boot |
| ------------------------- | ------ | ----------- |
| Sem token, rota protegida | `401`  | `403`       |
| Token válido, role errada | `403`  | `403`       |
| Token malformado          | `403`  | `403`       |

---

## 6. JWT (JJWT)

```xml
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-api</artifactId><version>0.13.0</version></dependency>
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-impl</artifactId><version>0.13.0</version><scope>runtime</scope></dependency>
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-jackson</artifactId><version>0.13.0</version><scope>runtime</scope></dependency>
```

Claims replicando o `JwtStrategy`/`JwtModule` do Nest: `sub` (id do usuário), `email`, `role`, expiração de 1h. Token intermediário de 2FA (`generateTempToken`) replica o `stage: '2fa-pending'` do Nest, com expiração de 5 minutos.

`JwtAuthenticationFilter` (`OncePerRequestFilter`) lê `Authorization: Bearer <token>`, valida assinatura/expiração via `JwtService`, e popula o `SecurityContextHolder` com `UsernamePasswordAuthenticationToken(userId, null, authorities)` — `authorities` sempre prefixadas com `ROLE_`, exigência do Spring Security para os checks de role funcionarem.

---

## 7. RBAC

`GET /admin/users` (paginado, via `Pageable`/`Page<T>` nativo do Spring Data — conversão de página 1-based do contrato HTTP para 0-based do Spring Data feita explicitamente) e `DELETE /admin/users/{id}`, protegidas por `.requestMatchers("/admin/**").hasRole("ADMIN")`.

Duas travas na exclusão, replicando o Nest exatamente (inclusive o status HTTP, `403 Forbidden`, não `409` como consideramos inicialmente antes de conferir a implementação original):

```java
if (targetId.equals(requesterId)) throw new AutoExclusionException(...);   // 403
if (targetUser.getRole() == Role.ADMIN) throw new CannotDeleteAdminException(...); // 403
```

**Seed do admin:** diferente do Nest (script `seed.ts` executado manualmente e separadamente), o Spring usa um `CommandLineRunner` (`DataSeeder`), que roda **automaticamente a cada boot** da aplicação — diferença arquitetural real entre os ecossistemas, não só de sintaxe. Idempotência garantida com `findByEmail(...).ifPresentOrElse(...)`, equivalente ao `upsert` do Prisma. As credenciais vêm de `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_NAME`.

---

## 8. 2FA / TOTP

```xml
<dependency><groupId>com.warrenstrange</groupId><artifactId>googleauth</artifactId><version>1.5.0</version>
  <exclusions><exclusion><groupId>junit</groupId><artifactId>junit</artifactId></exclusion></exclusions>
</dependency>
<dependency><groupId>org.apache.httpcomponents</groupId><artifactId>httpclient</artifactId><version>4.5.14</version></dependency>
<dependency><groupId>com.google.zxing</groupId><artifactId>core</artifactId><version>3.5.3</version></dependency>
<dependency><groupId>com.google.zxing</groupId><artifactId>javase</artifactId><version>3.5.3</version></dependency>
```

**Bug de gestão de dependências (relevante o suficiente para detalhar):** o scanner de vulnerabilidades da IDE apontou CVEs em dependências transitivas do `googleauth` (JUnit e Apache HttpClient antigos). Excluímos as duas via `<exclusions>`. Resultado: `NoClassDefFoundError: org/apache/http/client/utils/URIBuilder` ao chamar `GoogleAuthenticatorQRGenerator.getOtpAuthTotpURL(...)` — a biblioteca **usa** `HttpClient` internamente para montar a URI do QR code, ao contrário do que supúnhamos. Correção: manter a exclusão do JUnit (realmente não usado em runtime) e **declarar `httpclient` explicitamente numa versão corrigida** (`4.5.14`) em vez de excluí-lo — o Maven prioriza a versão declarada explicitamente sobre a transitiva antiga. Lição: excluir uma dependência transitiva sem confirmar onde ela é usada pode quebrar a aplicação silenciosamente, só na hora de exercitar aquele caminho de código específico.

Fluxo replicado do Nest: `setup` (gera segredo + QR code em base64 via ZXing) → `enable` (valida primeiro código, ativa `twoFactorEnabled`) → login com 2FA ativo retorna `{requiresTwoFactor: true, tempToken}` em vez do token completo → `2fa/verify` troca por token de acesso definitivo. **Decisão registrada:** o `verifyTwoFactor` não emite refresh token (replicando o Nest), possivelmente como política deliberada de sessão mais curta para contas com 2FA ativo.

**Bug de segurança encontrado ao integrar com o frontend (não durante o desenvolvimento isolado do backend):** o método `loginWithGoogle` (seção 11) não fazia essa mesma checagem de `twoFactorEnabled` antes de emitir o token — um usuário com 2FA ativado podia contornar completamente a proteção fazendo login social com a mesma conta de e-mail. Corrigido replicando a mesma lógica de `tempToken`/`requiresTwoFactor` usada aqui. Reforça uma lição geral: qualquer caminho alternativo de autenticação precisa das mesmas checagens do caminho principal.

### 8.1 — Proteção contra reuso do código TOTP

Sem proteção, o mesmo código de 6 dígitos era aceito várias vezes dentro da janela de validade. A documentação original exige rejeitar o reuso.

**Desenho** (mesmo do Nest): guardar em `users` o último passo de tempo aceito (`two_factor_last_step`, onde passo = `epoch em segundos / 30`). Um código só vale se o passo em que ele casou for **estritamente maior** que o último aceito.

- **Migration:** `V2__add_two_factor_last_step.sql` (`ALTER TABLE users ADD COLUMN two_factor_last_step INTEGER;`) e o campo `Integer twoFactorLastStep` na entidade, compatível com `ddl-auto=validate`.
- **`TotpService.verifyAndConsumeTotp`:** testa os passos `atual-1`, `atual` e `atual+1`, calculando o código esperado com `gAuth.getTotpPassword(secret, passo * 30000L)`. **A API do googleauth recebe o tempo em milissegundos**, ao contrário do `epoch` do otplib no Nest, que é em segundos.
- **`UPDATE` atômico condicional** no `UserRepository`:

```java
@Modifying
@Query("UPDATE User u SET u.twoFactorLastStep = :passo WHERE u.id = :id AND (u.twoFactorLastStep IS NULL OR u.twoFactorLastStep < :passo)")
int updateTwoFactorLastStep(@Param("id") UUID id, @Param("passo") Integer passo);
```

O código só é aceito se o `UPDATE` afetar exatamente 1 linha. Isso evita a corrida entre duas requisições simultâneas com o mesmo código (um `SELECT` seguido de `UPDATE` deixaria a janela aberta).

- **Onde é usado:** nos dois pontos que verificam TOTP (`UserService.enableTwoFactor` e `AuthService.verifyTwoFactor`). O `setupTwoFactor` zera o `twoFactorLastStep` ao gerar um segredo novo.
- **Mesmo erro para código inválido e reutilizado**, para não revelar que o código era válido.

**Bug real encontrado na revisão (os testes unitários com mock não o pegavam):** no `enableTwoFactor`, o `findById` carregava o usuário com `twoFactorLastStep = null`; o `TotpService` gravava o passo por um `UPDATE` direto; e então o `save(user)` do Hibernate gerava um `UPDATE` com **todas as colunas**, incluindo o `last_step` antigo (`null`), **desfazendo a proteção**. O código usado para ativar o 2FA ficava reutilizável no login seguinte. A correção é `@DynamicUpdate` na entidade `User`, para o Hibernate atualizar só as colunas que realmente mudaram. O Nest não tinha o problema, porque faz `update` parcial do campo `twoFactorEnabled`.

---

## 9. Recuperação de senha

Diferença de algoritmo relevante em relação ao token de refresh (seção 10): como o BCrypt inclui salt aleatório embutido, **não é possível** buscar direto por hash no banco — o `resetPassword` itera sobre todos os registros não expirados (`findByExpiresAtAfter`) e usa `passwordEncoder.matches(token, hashArmazenado)` um por um, igual ao `bcrypt.compare` em loop do Nest.

**Bug real de lógica (não de sintaxe) encontrado e corrigido:** a primeira versão comparava `passwordEncoder.matches(newPassword, tokenHash)` — a **senha nova**, não o **token recebido** — contra o hash do token. Resultado: todo reset falhava com "token inválido", mesmo com token correto, porque a comparação nunca testava o valor certo. Coberto por teste de regressão específico (`resetPassword_deveCompararTokenRecebido_naoASenhaNova`).

Mensagem de resposta sempre genérica (`"Se o e-mail existir, um link de recuperação foi enviado."`), independente do e-mail existir — mesma proteção contra enumeração do Nest.

### 9.1 — Envio real de e-mail

Em três etapas, na ordem real:

1. **Simulado:** `System.out.println` com o link.
2. **`spring-boot-starter-mail` + `JavaMailSender`** com SMTP do Gmail (senha de app). Funcionou em desenvolvimento.
3. **Brevo via API HTTP:** necessário no deploy, porque os serviços gratuitos do Render **não conseguem enviar SMTP de saída**.

A classe `EmailService` usa o `RestClient` do Spring (sem dependência nova), com as propriedades `brevo.api-key` e `mail.from`, lidas de `BREVO_API_KEY` e `MAIL_FROM`:

```properties
brevo.api-key=${BREVO_API_KEY:}
mail.from=${MAIL_FROM:}
```

```java
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private final RestClient rest = RestClient.create("https://api.brevo.com");

    @Value("${brevo.api-key:}")
    private String apiKey;

    @Value("${mail.from:}")
    private String from;

    public void send(String to, String subject, String html) {
        try {
            rest.post()
                .uri("/v3/smtp/email")
                .header("api-key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                    "sender", Map.of("name", "Auth Benchmark", "email", from),
                    "to", List.of(Map.of("email", to)),
                    "subject", subject,
                    "htmlContent", html))
                .retrieve()
                .toBodilessEntity();
        } catch (RestClientException e) {
            log.error("Falha ao enviar e-mail", e);
        }
    }
}
```

O `AuthService` monta o link com `frontend.url` (variável `FRONTEND_URL`) e a stack:

```java
String resetLink = frontendUrl + "/reset-password?token=" + token + "&stack=springboot";
```

**O método não lança erro de propósito:** se o envio falhasse com exceção, a resposta de `forgot-password` mudaria para e-mails existentes, e isso revelaria quais e-mails estão cadastrados.

**Bugs reais que esse trecho já teve:**

- O link estava fixo em `http://localhost:4200`, e em produção apontaria para a máquina do usuário. Agora usa `frontend.url`.
- Sem `&stack=springboot`, a tela de reset descobria a API pelo `localStorage`, e o token de uma stack podia ir parar na outra ("Token inválido ou expirado"). Agora o link informa a stack.
- O teste `forgotPassword_deveCriarReset_quandoEmailExiste` dava `NullPointerException` ao trocar para o `EmailService`: o `@InjectMocks` injeta `null` nos tipos sem mock. A correção foi trocar o `@Mock JavaMailSender` por `@Mock EmailService` e verificar `emailService.send(...)`.

O remetente (`MAIL_FROM`) precisa estar validado no painel do Brevo. Sem domínio próprio autenticado, mensagens de um remetente Gmail podem cair no spam.

---

## 10. Refresh Token / Logout

Mesma decisão de hashing do Nest: **SHA-256**, não BCrypt, pelos mesmos motivos (alta entropia do token gerado por `SecureRandom` de 40 bytes; busca indexada direta `WHERE token_hash = ?` em vez de iteração O(n)).

**Bug real:** `deleteByTokenHash` (query derivada de exclusão) lançou `TransactionRequiredException: No EntityManager with actual transaction available` — diferente de `save()`/`deleteById()` (que já vêm com transação própria embutida), métodos de escrita via **query derivada por nome** exigem `@Transactional` explícito no método que os invoca. Corrigido com `@Transactional` no `logout`.

Rotação a cada uso: `refresh` deleta o token antigo antes de emitir e persistir o par novo — mesmo padrão do Nest, mesma motivação (detecção implícita de roubo de token: se o dono legítimo tentar usar um token já rotacionado, percebe imediatamente).

**Comportamento idempotente confirmado e documentado, não é bug:** chamar `/auth/logout` duas vezes com o mesmo token não gera erro na segunda vez — `deleteByTokenHash` não lança exceção quando não encontra nada para deletar, e a resposta é sempre a mesma mensagem de sucesso. Replica o `deleteMany` do Prisma no Nest.

---

## 11. Login social Google

```xml
<dependency><groupId>com.google.api-client</groupId><artifactId>google-api-client</artifactId><version>2.9.0</version></dependency>
```

`GoogleIdTokenVerifier` (equivalente ao `googleClient.verifyIdToken` do Nest) valida assinatura contra as chaves públicas do Google e o `audience` (`GOOGLE_CLIENT_ID`, mesma variável usada no Nest, mesmo projeto no Google Cloud Console). Usuário criado via `findByEmail(...).orElseGet(...)` (equivalente ao `upsert`), com `password: null` — contas Google não têm senha. O nome vindo do Google passa pelo `InputSanitizer`; se ficar vazio, a requisição é rejeitada com `InvalidNameException` (`400`).

**Bug real (mesma classe do item 5.1):** `verifier.verify(idToken)`, ao receber uma string que não é sequer um JWT bem-formado, lança `IllegalArgumentException` **direto do parser**, antes mesmo de retornar `null` como o fluxo normal assumia. O `catch (GeneralSecurityException | IOException e)` original não capturava esse tipo, e a exceção subia crua até o 403 mascarado (item 5.1). Corrigido ampliando o catch: `catch (GeneralSecurityException | IOException | IllegalArgumentException e)`.

**Verificação de 2FA adicionada** (ver seção 8) — `loginWithGoogle` agora retorna `Object` (não mais um DTO fixo), igual ao `login()` normal, para poder devolver tanto `TwoFactorPendingResponseDto` quanto `TwoFactorVerifiedResponseDto` dependendo do estado da conta.

**Pendência conhecida, decisão consciente:** o "caminho feliz" (token Google real e válido) não foi testado manualmente nem coberto por teste unitário isolado — exigiria um `idToken` real emitido pelo Google. Testado indiretamente via frontend Angular real (fluxo completo, incluindo o desafio de 2FA), mas não incluído no teste e2e automatizado (seção 13.2), que usa credenciais e-mail/senha por não ter como gerar um `idToken` Google válido em ambiente de teste automatizado.

---

## 11.1. Migração de `ddl-auto=update` para Flyway (feita após todas as funcionalidades prontas)

Decisão tomada deliberadamente **depois** de todo o backend estar funcional, para não competir por atenção com o desenvolvimento das features — e porque só nesse ponto ficou claro, ao comparar com a maturidade do Nest, que essa era uma lacuna de rigor a fechar antes do Laravel.

```xml
<dependency>
   <groupId>org.springframework.boot</groupId>
   <artifactId>spring-boot-starter-flyway</artifactId>
</dependency>
<dependency>
   <groupId>org.flywaydb</groupId>
   <artifactId>flyway-database-postgresql</artifactId>
</dependency>
```

```properties
spring.jpa.hibernate.ddl-auto=validate
spring.jpa.open-in-view=false
```

`validate` (não `none`): mantém o Hibernate conferindo que as entidades batem com o schema real a cada boot, sem nunca alterá-lo — só o Flyway tem permissão de mudança daqui em diante. Migration inicial (`V1__create_initial_schema.sql`, em `src/main/resources/db/migration/`) escrita manualmente a partir do schema que o Hibernate já havia gerado, com o banco `authdb_springboot` zerado antes (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) — decisão segura porque os únicos dados existentes eram de teste, e o admin é recriado automaticamente pelo `DataSeeder` no boot seguinte. **Vantagem que se confirmou na prática mais tarde:** o banco de teste e2e (`authdb_springboot_test`, seção 13.2) e o banco de produção no Neon receberam as migrations automaticamente ao subir a aplicação, sem nenhum passo manual — exatamente o comportamento que a migração para Flyway pretendia garantir.

**Bug real e relevante para quem usa Spring Boot 4 (não uma peculiaridade deste projeto):** adicionar só `flyway-core` + `flyway-database-postgresql` fez a aplicação subir **sem nenhuma linha de log do Flyway** — nem sucesso, nem erro, silêncio total — e o Hibernate falhava logo em seguida com `SchemaManagementException: missing table`. Causa: o Spring Boot 4 **modularizou** a auto-configuração que antes vinha monolítica no jar `spring-boot-autoconfigure`; a partir dessa versão, `flyway-core` sozinho no classpath **não é mais suficiente** para ativar a auto-configuração do Flyway — é necessário o starter dedicado `spring-boot-starter-flyway`, que traz consigo o módulo de configuração que efetivamente invoca o Flyway no ciclo de boot. Sem o starter, o Flyway fica "presente mas mudo": totalmente funcional como biblioteca, sem nenhuma integração automática com o Spring. Esse mesmo padrão (starters específicos substituindo dependências "cruas" que bastavam em versões anteriores do Spring Boot) reapareceu depois com os artifacts de teste (seções 13.1 e 13.2) — vale desconfiar sempre que uma dependência conhecida "simplesmente não faz nada" em Spring Boot 4, sem nenhum erro visível.

**Também corrigido no mesmo momento:** `spring.jpa.open-in-view=false`. Open Session in View (`true` por padrão, silenciosamente) mantém a conexão de banco aberta durante toda a requisição HTTP, não só durante a query — evita `LazyInitializationException` em relacionamentos preguiçosos acessados tardiamente, ao custo de reter conexões do pool por mais tempo que o necessário e mascarar possíveis problemas de N+1 queries. Como o projeto não usa nenhum relacionamento `@ManyToOne`/`@OneToMany` real ainda (`RefreshToken.userId` é um UUID solto, não uma relação JPA), desabilitar agora não muda nenhum comportamento observável — decisão preventiva, para que qualquer dependência futura desse comportamento "mágico" falhe de forma clara e imediata, em vez de silenciosamente.

---

## 12. Segurança transversal

- **Anti-SQL Injection:** garantido nativamente pelo Hibernate/JPA — todas as queries (inclusive as geradas automaticamente por nome de método, como `findByEmail`) usam Prepared Statements. Nenhuma configuração adicional necessária.
- **Anti-XSS:** `InputSanitizer` (OWASP Java HTML Sanitizer), política totalmente restritiva (`new HtmlPolicyBuilder().toFactory()`, zero tags permitidas), aplicada ao campo `name` no cadastro e ao nome vindo do Google. Nome vazio depois de sanitizado resulta em `InvalidNameException` (`400`). **Nota de gestão de dependência:** a versão inicial cogitada (`20240325.1`) tinha uma vulnerabilidade conhecida (CVE-2025-66021, XSS via `noscript`/`style`) — não explorável pela política restritiva usada aqui, mas corrigida mesmo assim atualizando para `20260101.1`, como prática consciente (não bastou "a lib é confiável", foi necessário checar a versão específica).
- **CORS:** liberado estritamente para `FRONTEND_URL` (mesma variável de ambiente do Nest), via `CorsConfigurationSource` registrado na filter chain — não uma configuração solta ou anotação `@CrossOrigin` espalhada.
- **Rate Limiting:** `Bucket4j` (**atenção ao nome do artifact**: `bucket4j_jdk17-core`, não `bucket4j-core` — renomeado/relocado nas versões recentes), filtro customizado (`RateLimitingFilter`) com um bucket por combinação IP+rota, 5 requisições/minuto em `/auth/login` e `/auth/forgot-password`, `429 Too Many Requests` ao exceder.

  **Bug real e sério, só descoberto pelo teste e2e (seção 13.2):** a checagem de rota sensível comparava `request.getRequestURI()` com `path.equals("/auth/login")`. Como o projeto usa `server.servlet.context-path=/api/v1`, a URI real de uma requisição de login é `/api/v1/auth/login` — a comparação `.equals(...)` **nunca batia**, e a variável `rotaSensivel` era sempre `false`. Resultado: o rate limiting estava **completamente inoperante em produção**, sem nenhum sintoma visível em uso normal (a rota funcionava normalmente, só sem limite nenhum de tentativas) — exatamente o tipo de bug que um teste unitário isolado do filtro (chamando o método com um path fake) nunca teria capturado, porque não exercitaria o `context-path` real da aplicação. Corrigido trocando `.equals(...)` por `.endsWith(...)`, tornando a checagem independente do prefixo de rota configurado.

  **Segundo bug, só visível em produção:** atrás do proxy do Render, `request.getRemoteAddr()` devolvia o IP do proxy, e **todos os visitantes dividiam o mesmo contador** de 5 tentativas por minuto. A correção é `server.forward-headers-strategy=native` no `application.properties`: o Tomcat passa a reescrever o `remoteAddr` com base no `X-Forwarded-For` de proxies confiáveis, e o filtro continua usando `getRemoteAddr()`. Há um teste e2e específico (seção 13.2) e a validação em produção foi feita com duas redes diferentes (Wi-Fi e dados móveis).

  **Limitação documentada (continua válida):** estado em memória (`ConcurrentHashMap`), reseta a cada restart, não escala entre múltiplas instâncias do backend e **não tem eviction** (o mapa cresce com cada combinação IP+rota nova) — aceitável no escopo do benchmark, exigiria um backend compartilhado (Redis) em cenário multi-instância real.

---

## 13. Testes

### 13.1 — Testes unitários

```
mvnw.cmd test
```

**Mais de 49 testes unitários** (JUnit 5 + Mockito), cobrindo `AuthService`, `UserService`, `AdminService`, `JwtService`, `InputSanitizer`, `TotpService`, `RateLimitingFilter` e `SecurityConfig` (configuração de CORS). Padrão: `@Mock` para dependências, `@InjectMocks` para a classe testada, `ArgumentCaptor` quando o valor exato salvo precisa ser inspecionado (não só "foi chamado").

**Dois testes de regressão documentam bugs reais encontrados durante o desenvolvimento**, não hipotéticos:

- `resetPassword_deveCompararTokenRecebido_naoASenhaNova` — trava o bug do item 9.
- `loginWithGoogle_deveLancarExcecao_quandoTokenMalformado` — trava o bug do item 11/5.1.

**Bug de configuração de teste:** `BackendSpringbootApplicationTests` (teste de contexto gerado pelo Initializr, mantido propositalmente — verifica que **toda** a aplicação sobe, Beans inclusos) falhou isoladamente com `PlaceholderResolutionException: Could not resolve placeholder 'ADMIN_EMAIL'`. Causa: a Run Configuration de testes do IntelliJ é **separada** da configuração da aplicação principal, e não herda variáveis de ambiente automaticamente — precisou configurar `ADMIN_NAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` também na configuração de teste.

**Bug de strict stubbing (Mockito):** um `when(...)` configurado em `@BeforeEach` mas não exercitado por todo teste da classe (ex: `getRemoteAddr()` nunca chamado quando a rota não é sensível, porque o filtro retorna cedo) lança `UnnecessaryStubbingException` em modo estrito. Corrigido movendo os `when(...)` para dentro de cada teste individual, em vez de compartilhados no setup.

**Lição do sanitizador mockado:** depois que a validação do nome passou a vir **antes** da checagem de e-mail duplicado no `register`, o teste `register_deveLancarExcecao_quandoEmailJaExiste` quebrou: o `InputSanitizer` é um `@Mock` e devolve `null` sem configuração, então o `register` lançava "O nome é obrigatório" antes de chegar ao `EmailAlreadyExistsException` esperado. A correção é configurar `when(inputSanitizer.sanitize("Nome")).thenReturn("Nome")` no início do teste. O bug estava no teste, não no código.

**Testes da proteção contra reuso de TOTP** (`TotpServiceTest`): o instante é injetável (parâmetro `nowSeconds`), o que permite controlar o tempo sem relógio falso.

### 13.2 — Testes e2e

Diferente do NestJS (onde o motor WASM do Prisma 7 forçou uma abordagem alternativa, batendo num servidor já rodando — ver README do Nest), o Spring Boot Test sobe a aplicação real dentro do próprio processo de teste **sem esse tipo de conflito**, então a abordagem clássica funciona direto.

**Banco de teste isolado**, no mesmo container Docker:

```powershell
docker exec -it auth-benchmark-db-1 psql -U admin -d postgres -c "CREATE DATABASE authdb_springboot_test;"
```

`src/test/resources/application-test.properties`, ativado via `@ActiveProfiles("test")`:

```properties
spring.datasource.url=jdbc:postgresql://localhost:5433/authdb_springboot_test
spring.datasource.username=admin
spring.datasource.password=admin
spring.jpa.hibernate.ddl-auto=validate
spring.jpa.open-in-view=false

jwt.secret=<mesmo secret do application.properties>
jwt.expiration=3600000

admin.name=Administrador
admin.email=admin@authbenchmark.com
admin.password=uma-senha-forte-aqui

frontend.url=http://localhost:4200
google.client-id=dummy-client-id-para-teste

server.servlet.context-path=/api/v1
```

Como o projeto já usa Flyway (seção 11.1), as migrations rodaram **automaticamente** ao subir a aplicação contra esse banco pela primeira vez — sem nenhum passo manual de setup de schema, diferente do Prisma no Nest.

**Bug de dependências específico do Spring Boot 4 (documentado porque provavelmente afeta qualquer projeto nessa versão):** `TestRestTemplate` foi **extraído do `spring-boot-starter-test`** para um artefato próprio a partir da v4. Adicionar só isso:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-resttestclient</artifactId>
    <scope>test</scope>
</dependency>
```

gerou `NoClassDefFoundError: org/springframework/boot/restclient/RestTemplateBuilder` — o `spring-boot-resttestclient` **depende** de `spring-boot-restclient` (não vem transitivamente sozinho nesse cenário), então foi necessário declarar os dois explicitamente:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-restclient</artifactId>
    <scope>test</scope>
</dependency>
```

Import correto (não é o caminho "clássico" de versões anteriores do Spring Boot): `org.springframework.boot.resttestclient.TestRestTemplate`. Além disso, diferente de versões anteriores, o bean `TestRestTemplate` **não é mais autoconfigurado automaticamente** — exige a anotação explícita na classe de teste:

```java
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;

@AutoConfigureTestRestTemplate
```

`AuthE2ETest.java` (em `src/test/java/.../e2e/`), cobrindo exatamente o mesmo conjunto de cenários do equivalente NestJS — registro, login, rejeição de credencial errada, rota protegida sem token, perfil com token válido, RBAC (usuário comum barrado em `/admin/users`, admin permitido), rate limiting e a **separação do rate limit por IP**:

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AuthE2ETest {
    // ...métodos anotados com @Order(1) a @Order(8)
}
```

O teste `@Order(8)` envia 6 logins com senha errada com o cabeçalho `X-Forwarded-For: 203.0.113.10` (ao menos um deve voltar `429`) e depois 1 login com `X-Forwarded-For: 203.0.113.20` (deve voltar `401`, não `429`), provando que cada cliente tem seu próprio contador.

**Dois bugs de configuração de teste encontrados e corrigidos, documentados porque não são óbvios:**

1. **`@Order` sem efeito:** adicionar `@Order(N)` em cada método de teste não teve efeito nenhum até adicionar `@TestMethodOrder(MethodOrderer.OrderAnnotation.class)` na classe — sem essa anotação mestra, o JUnit 5 ignora os números e usa uma ordem própria (baseada em hash do nome do método), não sequencial.
2. **Por que a ordem importa aqui:** os testes compartilham estado real (o mesmo banco, o mesmo processo de aplicação) — em especial, o `RateLimitingFilter` usa um bucket por IP, e todos os testes rodam do `localhost`. Sem ordem garantida, o teste de rate limiting (que propositalmente esgota o bucket) podia rodar **antes** de outros testes que também precisam logar, fazendo-os falhar com `429` em vez do resultado esperado. Corrigido fixando os testes de rate limiting como os **últimos** (`@Order(7)` e `@Order(8)`).

**Resultado do teste e2e, além de validar o fluxo: revelou o bug real do rate limiting documentado na seção 12** — só foi possível descobrir porque o teste faz requisições HTTP reais contra a URL completa da aplicação (`context-path` incluso), algo que nenhum teste unitário isolado do filtro exercitava.

**Como rodar:**

```powershell
# Via IntelliJ: botão de play na classe AuthE2ETest (recomendado neste projeto)
# Ou, se o Maven estiver no PATH:
.\mvnw.cmd test -Dtest=AuthE2ETest
```

**Cobertura pendente, decisão consciente:** caminho feliz do Google OAuth (ver item 11) não está no teste e2e — exigiria um `idToken` real do Google, não gerável em ambiente de teste automatizado.

---

## 14. Deploy: Docker + Render + Neon

**`application.properties` sem segredos:** tudo vem de variáveis de ambiente, com padrões de desenvolvimento local:

```properties
spring.datasource.url=${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5433/authdb_springboot}
spring.datasource.username=${SPRING_DATASOURCE_USERNAME:admin}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD:admin}
jwt.secret=${JWT_SECRET:<valor-de-desenvolvimento>}
admin.email=${ADMIN_EMAIL}
admin.password=${ADMIN_PASSWORD}
frontend.url=${FRONTEND_URL:http://localhost:4200}
google.client-id=${GOOGLE_CLIENT_ID}
server.port=${PORT:8080}
server.servlet.context-path=/api/v1
server.forward-headers-strategy=native
brevo.api-key=${BREVO_API_KEY:}
mail.from=${MAIL_FROM:}
```

O `JWT_SECRET` padrão serve só para desenvolvimento local e **é obrigatório no Render**, senão a aplicação subiria com um segredo público. Antes dessa refatoração, o arquivo tinha segredos reais escritos (senha de app do Gmail, `jwt.secret`). Todos foram trocados depois.

**Dockerfile** (multi-stage, na pasta do `pom.xml`):

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-Xmx300m", "-XX:+UseSerialGC", "-jar", "app.jar"]
```

`-Xmx300m` e `SerialGC` limitam o heap da JVM para caber nos 512 MB do plano gratuito do Render. O primeiro boot é lento (JVM + Flyway).

**Variáveis de ambiente no Render:**

| Variável                                                    | Valor                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `SPRING_DATASOURCE_URL`                                     | `jdbc:postgresql://HOST-DO-NEON/authdb_springboot?sslmode=require` |
| `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD` | usuário e senha do Neon                                            |
| `JWT_SECRET`                                                | segredo gerado só para produção                                    |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`             | conta administradora (criada pelo `DataSeeder` no boot)            |
| `GOOGLE_CLIENT_ID`                                          | o mesmo do Nest                                                    |
| `FRONTEND_URL`                                              | URL do front, **sem barra no final**                               |
| `BREVO_API_KEY` / `MAIL_FROM`                               | chave de API e remetente validado                                  |

**Detalhes que pegam:**

- **URL JDBC:** usuário e senha **não** vão dentro da URL (diferente da string do Prisma); são variáveis separadas. O `HOST` é o trecho depois do `@` da string do Neon, sem `-pooler` e sem `channel_binding`.
- **Root Directory = `backend-springboot/backend-springboot`** (a pasta aninhada, que contém o `pom.xml`). O primeiro deploy falhou com `failed to read dockerfile: open Dockerfile: no such file or directory` porque o caminho estava errado.
- **Migrations:** o Flyway aplica as migrations (`V1`, `V2`) no boot, no banco do Neon. O seed do admin também roda no boot.
- **Cold start:** o plano gratuito dorme após 15 minutos sem uso, e o primeiro acesso leva até 1 minuto.

---

## 15. Limitações conhecidas

- **Secret do 2FA em texto puro** no banco. A evolução prevista é criptografá-lo.
- **Janela do TOTP de ±1 passo (30 s):** tolera relógios levemente dessincronizados; o bloqueio de reuso reduz o risco dessa folga.
- **Rate limiting em memória, sem eviction:** zera a cada reinício e não é compartilhado entre instâncias.
- **Sanitização só no campo `name`.**
- **`verifyTwoFactor` não emite refresh token:** contas com 2FA ativo têm sessão de 1 h sem renovação.
- **Spring retorna `403` onde o NestJS retorna `401`** para rota protegida sem token (seção 5.2).
- **Caminho feliz do Google OAuth fora do e2e** (exige um `idToken` real).
- **`spring-boot-starter-mail` ainda no `pom.xml`**, sem uso desde a troca para o Brevo; pode ser removido.
- **Plano gratuito do Render:** cold start de até 1 minuto.

---

## 16. Notas comparativas NestJS vs Spring Boot (para o benchmark)

- **Verbosidade de código:** ~62,5% Java vs ~37,5% TypeScript nas linhas do repositório. Parcialmente explicado por tipagem explícita obrigatória, anotações mais longas, e ausência de union types (Java prefere DTOs de resposta separados onde TS poderia usar `TipoA | TipoB`). Não é, por si só, uma medida de qualidade — pode favorecer legibilidade em times grandes.
- **Quantidade de DTOs:** 14 no Spring vs 9 no Nest. Consequência direta de decisões de design tomadas durante o projeto (ex: separar `LoginResponseDto` de `TwoFactorVerifiedResponseDto` para não forçar campos `null` artificiais), não uma exigência do framework.
- **Organização de pastas:** Nest usa "package by feature" (cada módulo com seu próprio Controller/Service, reforçado pelo próprio CLI); este projeto Spring usa "package by layer" (`controller/`, `service/`, `repository/`, `model/`) — escolha pedagógica deliberada no início do projeto, não limitação técnica (Spring suporta as duas convenções). Percepção registrada durante o desenvolvimento: a organização por camada facilitou o entendimento inicial, mas tornou-se mais poluída à medida que novas features foram chegando — o oposto do que se sentiu no Nest, onde a organização por feature escalou melhor com o crescimento do projeto.
- **Filosofia de segurança:** Spring Security é "seguro por padrão" (bloqueia tudo assim que a dependência existe, exige liberação explícita); Nest/Passport é "explícito por padrão" (nada é protegido a menos que um Guard seja aplicado). Nenhuma é objetivamente superior — são trade-offs de design diferentes.
- **Códigos HTTP em cenários de autenticação ausente:** ver tabela na seção 5.2.
- **Unidade de tempo do TOTP:** o `epoch` do otplib (Nest) é em segundos; o `getTotpPassword` do googleauth (Spring) é em milissegundos. Um erro de unidade aqui não seria pego por testes que geram o código esperado com a mesma função.
- **Testes e2e:** o motor WASM do Prisma 7 (NestJS) exigiu uma estratégia alternativa (bater num servidor já rodando); o Spring Boot Test não teve esse problema, mas trouxe sua própria complexidade específica de versão (extração do `TestRestTemplate` para artefato próprio no Spring Boot 4). Em ambos os casos, o esforço de configurar os testes e2e valeu a pena além da cobertura em si: cada um revelou pelo menos um bug real que nenhum teste unitário isolado capturaria (2FA bypass via Google no Nest, rate limiting inoperante no Spring).

---

## 17. Comandos de inicialização (checklist de retomada)

```powershell
# 1. Abrir o Docker Desktop manualmente
# 2. Na raiz do projeto:
docker compose up -d
docker compose ps   # confirmar "(healthy)"

# 3. Run Configuration do IntelliJ, com "Include system environment variables" marcado:
#    ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, FRONTEND_URL, GOOGLE_CLIENT_ID,
#    JWT_SECRET, BREVO_API_KEY, MAIL_FROM
#    (as SPRING_DATASOURCE_* só são necessárias para apontar para outro banco)

# 4. Se o build falhar com "Failed to delete" no clean:
#    apagar manualmente a pasta target/ antes de compilar de novo.

# 5. Rodar via IntelliJ (botão Run) ou:
.\mvnw.cmd spring-boot:run
```

Para rodar os testes e2e, ver seção 13.2 (banco de teste separado + variáveis de ambiente também na Run Configuration de teste). Para publicar, ver a seção 14.
