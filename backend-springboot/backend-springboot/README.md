# Backend Spring Boot — Auth Benchmark

Este documento é um **tutorial passo a passo** de como este backend foi construído, na ordem real em que as decisões foram tomadas — incluindo os bugs genuínos encontrados no caminho (não uma versão "limpa" fictícia). O objetivo é permitir reproduzir o processo do zero, sem depender de memória, e servir de referência ao comparar com as implementações em NestJS e Laravel.

## Stack

- **Java 21**, **Spring Boot 4.1.1**, **Maven**
- **Spring Data JPA** (ORM) + **Hibernate 7.4.5**
- **PostgreSQL 16** (via Docker, banco próprio `authdb_springboot`)
- **Spring Security** (filter chain customizada, sem sessão)
- **JJWT 0.13.0** (JWT)
- **Lombok** (redução de boilerplate)
- **GoogleAuth** (`com.warrenstrange:googleauth`) + **ZXing** (2FA/TOTP + QR code)
- **google-api-client** (login social Google)
- **OWASP Java HTML Sanitizer** (Anti-XSS)
- **Bucket4j** (Rate Limiting)
- **JUnit 5 + Mockito** (testes unitários)

## Pré-requisitos

- Docker Desktop instalado e aberto
- JDK 21
- IntelliJ IDEA (Community já é suficiente)

---

## 1. Por que Spring Boot não é "NestJS em Java"

Antes de qualquer código, vale registrar a diferença de filosofia que guiou todas as decisões abaixo:

- **Inversão de Controle**: o Nest usa DI explícita via módulos (`@Module`); o Spring escaneia o classpath inteiro (`@ComponentScan`) e monta o grafo de dependências sozinho, sem listagem manual de providers.
- **"Seguro por padrão" vs "explícito por padrão"**: assim que a dependência `spring-boot-starter-security` entra no `pom.xml`, o Spring Boot **bloqueia todas as rotas automaticamente**, sem você pedir nada — o oposto do Nest, onde você aplica `@UseGuards()` explicitamente onde quiser proteção. Isso pegou a gente de surpresa na primeira vez que rodamos a aplicação após adicionar Security (ver seção 5).
- **Servlet Filter Chain vs Guards**: no Spring, autenticação/autorização acontece numa cadeia de `Filter`s de baixo nível (anterior ao roteamento do Spring MVC); no Nest, Guards rodam **depois** do roteamento já ter decidido qual handler tratar a requisição. Isso explica comportamentos que pareceriam bugs se comparados ingenuamente linha a linha com o Nest (ex: item 12).

---

## 2. Criando o projeto (Spring Initializr)

Gerado via [start.spring.io](https://start.spring.io): Maven, Java 21, Packaging Jar, dependências iniciais `Spring Web`, `Spring Data JPA`, `PostgreSQL Driver` (Security foi adicionado **depois**, deliberadamente, para entender o impacto de cada dependência isoladamente).

**Bug de nomenclatura de pasta:** o Artifact foi definido como `backend-springboot` para bater com a convenção de pastas já usada pelo `backend-nestjs` no mesmo monorepo — o Initializr converte hífen para underscore no nome do pacote Java gerado (`backend_springboot`), o que é esperado, não um erro.

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

**Bug bobo, mas real:** digitamos `JDBC:postgresql://...` (maiúsculo). O prefixo do schema da URL é *case-sensitive* — `JDBC` maiúsculo não é reconhecido, gerando exatamente o mesmo erro de "driver não encontrado", mesmo com o driver já no classpath. Lição: o erro "driver não encontrado" não significa necessariamente "dependência faltando" — pode ser a URL malformada.

### 3.2 — `target/classes` desatualizado

Mesmo corrigindo o `application.properties`, o erro persistia **idêntico**. Causa: o IntelliJ rodou a aplicação sem recompilar o `resources` mais recente. `mvnw.cmd clean compile` também falhou (`Failed to delete ... -> [Help 1]`), porque um processo Java anterior ainda segurava arquivos do build antigo.

**Falsa pista perseguida:** inicialmente suspeitamos do OneDrive (o projeto estava em `Documentos`, sincronizado), e chegamos a recomendar mover o projeto para fora dele. **Isso estava errado.** A causa real era um `target/classes` corrompido por um `clean` anterior que falhou no meio do processo — apagar a pasta manualmente (`rmdir /s /q target`) resolveu, sem qualquer relação com OneDrive. Lição registrada: escalar para uma mudança estrutural grande (trocar de pasta/ambiente) antes de esgotar hipóteses locais e simples é um erro de processo de debugging, mesmo quando a hipótese parece plausível.

---

## 4. Modelo de dados (JPA vs Prisma)

**Diferença de filosofia de ORM:** Prisma tem uma fonte de verdade declarativa própria (`schema.prisma`) com migrations geradas e versionadas explicitamente. JPA/Hibernate usa classes Java anotadas como fonte de verdade, com **duas opções**: deixar o Hibernate gerar/alterar o schema automaticamente (`ddl-auto=update`, usado inicialmente neste projeto, só durante o desenvolvimento) ou usar uma ferramenta de migration explícita (Flyway/Liquibase). Este projeto **migrou de `update` para Flyway** depois que o restante das funcionalidades já estava pronto (ver seção 11.1), replicando o rigor que o Nest já tinha desde o início com Prisma Migrate.

```java
@Entity
@Table(name = "users")
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

    @CreationTimestamp @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
```

**Diferença observada e registrada:** o Prisma define `role` como `String` livre; o Hibernate, ao mapear um `enum Role` com `@Enumerated(EnumType.STRING)`, gera automaticamente um **CHECK constraint** no banco (`role IN ('ADMIN','USER')`), impedindo fisicamente valores fora do enum — algo que o schema do Prisma, como está, não impõe no nível de banco.

**Banco isolado por backend, mesmo container:** decisão consciente (ver discussão no processo) — como o frontend Angular vai testar **um backend por vez** (nunca os três simultaneamente sob carga), não há necessidade de containers Postgres totalmente separados por backend; bancos separados (`authdb`, `authdb_springboot`, `authdb_laravel`) dentro do mesmo container já garantem isolamento de dados sem gastar mais recursos.

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
                             "/auth/social/google").permitAll()
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

### 5.1 — Bug: 403 mascarando erros reais (recorrente)

Padrão encontrado **três vezes** ao longo do projeto: uma exceção de negócio não tratada (`IllegalArgumentException` genérica) sobe até o container de servlets, que tenta fazer um *forward* interno para `/error` — rota que **também passa pela filter chain** e é barrada pela regra `anyRequest().authenticated()`, mascarando o erro real (500) atrás de um **403 sem corpo nenhum**. Casos concretos:

1. Email duplicado no registro, antes de existir um `@RestControllerAdvice`.
2. Google OAuth: `GoogleIdTokenVerifier.verify()` lança `IllegalArgumentException` para tokens malformados — tipo não capturado pelo `catch (GeneralSecurityException | IOException e)` original.

**Lição geral:** um `403` sem mensagem nenhuma no Spring Security quase sempre significa "algo quebrou antes/durante, e o `/error` foi bloqueado" — não necessariamente "sem permissão". Investigar sempre pelo log do console, nunca só pelo status HTTP.

**Solução estrutural:** `@RestControllerAdvice` central (`GlobalExceptionHandler`), com um `@ExceptionHandler` por tipo de exceção customizada, e `@ExceptionHandler(MethodArgumentNotValidException.class)` para erros de Bean Validation — nunca deixar exceção de negócio subir crua.

### 5.2 — Diferença de contrato registrada (não corrigida, documentada)

Testado empiricamente: chamar uma rota `/admin/**` **sem token nenhum** retorna `403` no Spring (o `AnonymousAuthenticationFilter` preenche o contexto com uma autenticação "anônima" válida, sem authorities — tecnicamente autenticado, apenas sem permissão), enquanto o `JwtAuthGuard` do Nest (via Passport) retorna `401` no mesmo cenário. Decisão: manter a diferença, documentar no benchmark como comportamento padrão divergente entre frameworks, não "bug" de nenhum dos dois lados.

| Cenário | NestJS | Spring Boot |
|---|---|---|
| Sem token, rota protegida | `401` | `403` |
| Token válido, role errada | `403` | `403` |
| Token malformado | `403` | `403` |

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

**Seed do admin:** diferente do Nest (script `seed.ts` executado manualmente e separadamente), o Spring usa um `CommandLineRunner` (`DataSeeder`), que roda **automaticamente a cada boot** da aplicação — diferença arquitetural real entre os ecossistemas, não só de sintaxe. Idempotência garantida com `findByEmail(...).ifPresentOrElse(...)`, equivalente ao `upsert` do Prisma.

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

---

## 9. Recuperação de senha

Diferença de algoritmo relevante em relação ao token de refresh (seção 10): como o BCrypt inclui salt aleatório embutido, **não é possível** buscar direto por hash no banco — o `resetPassword` itera sobre todos os registros não expirados (`findByExpiresAtAfter`) e usa `passwordEncoder.matches(token, hashArmazenado)` um por um, igual ao `bcrypt.compare` em loop do Nest.

**Bug real de lógica (não de sintaxe) encontrado e corrigido:** a primeira versão comparava `passwordEncoder.matches(newPassword, tokenHash)` — a **senha nova**, não o **token recebido** — contra o hash do token. Resultado: todo reset falhava com "token inválido", mesmo com token correto, porque a comparação nunca testava o valor certo. Coberto por teste de regressão específico (`resetPassword_deveCompararTokenRecebido_naoASenhaNova`).

Mensagem de resposta sempre genérica (`"Se o e-mail existir, um link de recuperação foi enviado."`), independente do e-mail existir — mesma proteção contra enumeração do Nest. E-mail simulado via `System.out.println`, mesma pendência documentada no Nest (seção 11).

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

`GoogleIdTokenVerifier` (equivalente ao `googleClient.verifyIdToken` do Nest) valida assinatura contra as chaves públicas do Google e o `audience` (`GOOGLE_CLIENT_ID`, mesma variável usada no Nest, mesmo projeto no Google Cloud Console). Usuário criado via `findByEmail(...).orElseGet(...)` (equivalente ao `upsert`), com `password: null` — contas Google não têm senha.

**Bug real (mesma classe do item 5.1):** `verifier.verify(idToken)`, ao receber uma string que não é sequer um JWT bem-formado, lança `IllegalArgumentException` **direto do parser**, antes mesmo de retornar `null` como o fluxo normal assumia. O `catch (GeneralSecurityException | IOException e)` original não capturava esse tipo, e a exceção subia crua até o 403 mascarado (item 5.1). Corrigido ampliando o catch: `catch (GeneralSecurityException | IOException | IllegalArgumentException e)`.

**Pendência conhecida, decisão consciente:** o "caminho feliz" (token Google real e válido) não foi testado manualmente nem coberto por teste unitário — exigiria um `idToken` real emitido pelo Google (via OAuth Playground ou integração com o Angular). Só o caminho de erro (token malformado/inválido) foi validado, incluindo o bug acima.

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

`validate` (não `none`): mantém o Hibernate conferindo que as entidades batem com o schema real a cada boot, sem nunca alterá-lo — só o Flyway tem permissão de mudança daqui em diante. Migration inicial (`V1__create_initial_schema.sql`, em `src/main/resources/db/migration/`) escrita manualmente a partir do schema que o Hibernate já havia gerado, com o banco `authdb_springboot` zerado antes (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) — decisão segura porque os únicos dados existentes eram de teste, e o admin é recriado automaticamente pelo `DataSeeder` no boot seguinte.

**Bug real e relevante para quem usa Spring Boot 4 (não uma peculiaridade deste projeto):** adicionar só `flyway-core` + `flyway-database-postgresql` fez a aplicação subir **sem nenhuma linha de log do Flyway** — nem sucesso, nem erro, silêncio total — e o Hibernate falhava logo em seguida com `SchemaManagementException: missing table`. Causa: o Spring Boot 4 **modularizou** a auto-configuração que antes vinha monolítica no jar `spring-boot-autoconfigure`; a partir dessa versão, `flyway-core` sozinho no classpath **não é mais suficiente** para ativar a auto-configuração do Flyway — é necessário o starter dedicado `spring-boot-starter-flyway`, que traz consigo o módulo de configuração que efetivamente invoca o Flyway no ciclo de boot. Sem o starter, o Flyway fica "presente mas mudo": totalmente funcional como biblioteca, sem nenhuma integração automática com o Spring. Esse mesmo padrão (starters específicos substituindo dependências "cruas" que bastavam em versões anteriores do Spring Boot) já havia aparecido antes neste projeto com os artifacts de teste (seção 13) — vale desconfiar sempre que uma dependência conhecida "simplesmente não faz nada" em Spring Boot 4, sem nenhum erro visível.

**Also corrigido no mesmo momento:** `spring.jpa.open-in-view=false`. Open Session in View (`true` por padrão, silenciosamente) mantém a conexão de banco aberta durante toda a requisição HTTP, não só durante a query — evita `LazyInitializationException` em relacionamentos preguiçosos acessados tardiamente, ao custo de reter conexões do pool por mais tempo que o necessário e mascarar possíveis problemas de N+1 queries. Como o projeto não usa nenhum relacionamento `@ManyToOne`/`@OneToMany` real ainda (`RefreshToken.userId` é um UUID solto, não uma relação JPA), desabilitar agora não muda nenhum comportamento observável — decisão preventiva, para que qualquer dependência futura desse comportamento "mágico" falhe de forma clara e imediata, em vez de silenciosamente.

---

## 12. Segurança transversal

- **Anti-SQL Injection:** garantido nativamente pelo Hibernate/JPA — todas as queries (inclusive as geradas automaticamente por nome de método, como `findByEmail`) usam Prepared Statements. Nenhuma configuração adicional necessária.
- **Anti-XSS:** `InputSanitizer` (OWASP Java HTML Sanitizer), política totalmente restritiva (`new HtmlPolicyBuilder().toFactory()`, zero tags permitidas), aplicada ao campo `name` no registro. **Nota de gestão de dependência:** a versão inicial cogitada (`20240325.1`) tinha uma vulnerabilidade conhecida (CVE-2025-66021, XSS via `noscript`/`style`) — não explorável pela política restritiva usada aqui, mas corrigida mesmo assim atualizando para `20260101.1`, como prática consciente (não bastou "a lib é confiável", foi necessário checar a versão específica).
- **CORS:** liberado estritamente para `FRONTEND_URL` (mesma variável de ambiente do Nest), via `CorsConfigurationSource` registrado na filter chain — não uma configuração solta ou anotação `@CrossOrigin` espalhada.
- **Rate Limiting:** `Bucket4j` (**atenção ao nome do artifact**: `bucket4j_jdk17-core`, não `bucket4j-core` — renomeado/relocado nas versões recentes), filtro customizado (`RateLimitingFilter`) com um bucket por combinação IP+rota, 5 requisições/minuto em `/auth/login` e `/auth/forgot-password`, `429 Too Many Requests` ao exceder. **Limitação documentada:** estado em memória (`ConcurrentHashMap`), reseta a cada restart e não escala entre múltiplas instâncias do backend — aceitável no escopo do benchmark (execução local, uma instância por vez), exigiria um backend compartilhado (Redis) em cenário multi-instância real.

---

## 13. Testes

```
mvnw.cmd test
```

**49 testes unitários** (JUnit 5 + Mockito), cobrindo `AuthService`, `UserService`, `AdminService`, `JwtService`, `InputSanitizer`, `RateLimitingFilter` e `SecurityConfig` (configuração de CORS). Padrão: `@Mock` para dependências, `@InjectMocks` para a classe testada, `ArgumentCaptor` quando o valor exato salvo precisa ser inspecionado (não só "foi chamado").

**Dois testes de regressão documentam bugs reais encontrados durante o desenvolvimento**, não hipotéticos:
- `resetPassword_deveCompararTokenRecebido_naoASenhaNova` — trava o bug do item 9.
- `loginWithGoogle_deveLancarExcecao_quandoTokenMalformado` — trava o bug do item 11/5.1.

**Bug de configuração de teste:** `BackendSpringbootApplicationTests` (teste de contexto gerado pelo Initializr, mantido propositalmente — verifica que **toda** a aplicação sobe, Beans inclusos) falhou isoladamente com `PlaceholderResolutionException: Could not resolve placeholder 'ADMIN_EMAIL'`. Causa: a Run Configuration de testes do IntelliJ é **separada** da configuração da aplicação principal, e não herda variáveis de ambiente automaticamente — precisou configurar `ADMIN_NAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` também na configuração de teste.

**Bug de strict stubbing (Mockito):** um `when(...)` configurado em `@BeforeEach` mas não exercitado por todo teste da classe (ex: `getRemoteAddr()` nunca chamado quando a rota não é sensível, porque o filtro retorna cedo) lança `UnnecessaryStubbingException` em modo estrito. Corrigido movendo os `when(...)` para dentro de cada teste individual, em vez de compartilhados no setup.

**Cobertura pendente, decisão consciente:** caminho feliz do Google OAuth (ver item 11).

---

## 14. Limitações conhecidas / pendências

- [ ] **Envio de e-mail real** — mesma pendência do Nest, mesmo motivo (adiada até os três backends estarem prontos, para tratamento comparável).
- [ ] Rate limiting sem teste de integração real sob carga (só unitário, simulando o filtro isoladamente).
- [ ] Caminho de sucesso do Google OAuth não testado manualmente nem automatizado.

**Resolvidas nesta sessão** (mantidas aqui só para rastreabilidade histórica): migrations versionadas via Flyway (seção 11.1) e desativação do Open Session in View (seção 11.1) — ambas eram pendências abertas desde a criação da entidade `User`, e ficaram sem gatilho claro de retomada por várias sessões seguidas; registrado como aprendizado de processo, não só de código.

---

## 15. Notas comparativas NestJS vs Spring Boot (para o benchmark)

- **Verbosidade de código:** ~62,5% Java vs ~37,5% TypeScript nas linhas do repositório. Parcialmente explicado por tipagem explícita obrigatória, anotações mais longas, e ausência de union types (Java prefere DTOs de resposta separados onde TS poderia usar `TipoA | TipoB`). Não é, por si só, uma medida de qualidade — pode favorecer legibilidade em times grandes.
- **Quantidade de DTOs:** 14 no Spring vs 9 no Nest. Consequência direta de decisões de design tomadas durante o projeto (ex: separar `LoginResponseDto` de `TwoFactorVerifiedResponseDto` para não forçar campos `null` artificiais), não uma exigência do framework.
- **Organização de pastas:** Nest usa "package by feature" (cada módulo com seu próprio Controller/Service, reforçado pelo próprio CLI); este projeto Spring usa "package by layer" (`controller/`, `service/`, `repository/`, `model/`) — escolha pedagógica deliberada no início do projeto, não limitação técnica (Spring suporta as duas convenções). Percepção registrada durante o desenvolvimento: a organização por camada facilitou o entendimento inicial, mas tornou-se mais poluída à medida que novas features foram chegando — o oposto do que se sentiu no Nest, onde a organização por feature escalou melhor com o crescimento do projeto.
- **Filosofia de segurança:** Spring Security é "seguro por padrão" (bloqueia tudo assim que a dependência existe, exige liberação explícita); Nest/Passport é "explícito por padrão" (nada é protegido a menos que um Guard seja aplicado). Nenhuma é objetivamente superior — são trade-offs de design diferentes.
- **Códigos HTTP em cenários de autenticação ausente:** ver tabela na seção 5.2.

---

## 16. Comandos de inicialização (checklist de retomada)

```powershell
# 1. Abrir o Docker Desktop manualmente
# 2. Na raiz do projeto:
docker compose up -d
docker compose ps   # confirmar "(healthy)"

# 3. Garantir variáveis de ambiente na Run Configuration do IntelliJ:
#    ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, FRONTEND_URL, GOOGLE_CLIENT_ID

# 4. Se o build falhar com "Failed to delete" no clean:
#    apagar manualmente a pasta target/ antes de compilar de novo.

# 5. Rodar via IntelliJ (botão Run) ou:
.\mvnw.cmd spring-boot:run
```