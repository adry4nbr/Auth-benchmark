# 📝 Documentação do Projeto: Benchmark de Autenticação Full-Stack

---

## 🎯 Objetivo do Projeto

Criar um sistema de autenticação e gestão de usuários de ponta a ponta para fins de aprendizado e comparação (benchmark). A ideia central é desenvolver **três APIs Back-end distintas** (usando linguagens e frameworks diferentes) que seguirão o mesmo contrato de rotas, regra de negócios e banco de dados. Um único **Front-end** será responsável por consumir essas APIs, permitindo avaliar e comparar a performance, praticidade de desenvolvimento, segurança e escalabilidade de cada tecnologia.

## 🛠️ Stack Tecnológica

- **Front-end:** Angular (com arquitetura preparada para troca dinâmica de API).
- **Back-end (As 3 APIs em concorrência):**

1. **Java:** Spring Boot (com Spring Security).
2. **JavaScript/Node.js:** NestJS (com Passport/JWT).
3. **PHP:** Laravel (com Sanctum/JWT).

- **Banco de Dados:** PostgreSQL (Única instância de banco para todas as APIs).
- **Infraestrutura:** Docker e `docker-compose` (Container isolado para o banco de dados e containers individuais para as APIs, configurados com limites de recursos de hardware para garantir testes justos de performance).

---

## ⚙️ Funcionalidades e Requisitos

### 1. Autenticação e Painel de Usuário

- **Cadastro:** Nome, E-mail, Senha e Confirmação de Senha (formulário extensível para facilitar a adição de novos campos no futuro).
- **Login Tradicional:** E-mail e Senha.
- **Login Social:** Integração via Google (OAuth2).
- **Duplo Fator de Autenticação (2FA):** Suporte a aplicativos de autenticação baseados em TOTP de 6 dígitos (ex: Google Authenticator, Authy).
- **Recuperação de Senha:** Fluxo completo de "Esqueci minha senha" com geração e envio de link/token.

### 2. Painel Administrativo (RBAC)

- **Níveis de Acesso:** Usuário Comum (`USER`) e Super Usuário (`ADMIN`).
- **Poderes do Admin:** Listar todos os usuários do sistema e excluir contas comuns.
- **Travas de Segurança:** O sistema deve impedir que um Admin exclua a si mesmo ou exclua outros Admins.

---

## 🗄️ Estrutura do Banco de Dados (PostgreSQL)

A modelagem será rigorosamente padronizada para que os ORMs das três linguagens (Hibernate, TypeORM/Prisma e Eloquent) consigam ler e gravar sem conflitos de tipagem.

**Tabela `users**`

- `id`: UUID (Evita enumeração de IDs nas rotas).
- `name`: VARCHAR(255)
- `email`: VARCHAR(255) — UNIQUE, INDEXED
- `password`: VARCHAR(255) — NULLABLE (Pode ser nulo caso o cadastro seja feito exclusivamente via Google).
- `role`: VARCHAR(20) — DEFAULT `'USER'`
- `two_factor_secret`: TEXT — NULLABLE (Guarda a chave TOTP encriptada).
- `two_factor_enabled`: BOOLEAN — DEFAULT `FALSE`
- `created_at` / `updated_at`: TIMESTAMP

**Tabela `password_resets**`

- `email`: VARCHAR(255) — INDEXED
- `token_hash`: VARCHAR(255) (Hash do token gerado para recuperação).
- `expires_at`: TIMESTAMP
- `created_at`: TIMESTAMP

---

## 🔌 Contrato de Rotas (As 3 APIs)

Independentemente da linguagem, todas as três APIs devem implementar estritamente os endpoints abaixo, retornando e recebendo as exatas mesmas estruturas JSON.

### Rotas Públicas (Autenticação)

| Método | Endpoint                       | Descrição                                                              |
| ------ | ------------------------------ | ---------------------------------------------------------------------- |
| `POST` | `/api/v1/auth/register`        | Criação de conta de usuário.                                           |
| `POST` | `/api/v1/auth/login`           | Validação inicial. Retorna o JWT ou, se ativado, pede o 2FA.           |
| `POST` | `/api/v1/auth/2fa/verify`      | Recebe token temporário + código de 6 dígitos para emitir o JWT final. |
| `POST` | `/api/v1/auth/social/google`   | Valida o token do Google no back-end e emite o JWT do sistema.         |
| `POST` | `/api/v1/auth/forgot-password` | Solicitação de recuperação de senha.                                   |
| `POST` | `/api/v1/auth/reset-password`  | Atualização da senha baseada no token recebido.                        |

### Rotas Privadas (Usuário Comum)

| Método | Endpoint                  | Descrição                                                |
| ------ | ------------------------- | -------------------------------------------------------- |
| `GET`  | `/api/v1/user/profile`    | Retorna os dados do perfil autenticado atual.            |
| `POST` | `/api/v1/user/2fa/setup`  | Gera o QR Code e a Secret (TOTP) para vinculação do 2FA. |
| `POST` | `/api/v1/user/2fa/enable` | Valida o primeiro código gerado e ativa o 2FA na conta.  |

### Rotas Administrativas (Admin Guard)

| Método   | Endpoint                   | Descrição                                        |
| -------- | -------------------------- | ------------------------------------------------ |
| `GET`    | `/api/v1/admin/users`      | Listagem de usuários do sistema (com paginação). |
| `DELETE` | `/api/v1/admin/users/{id}` | Exclusão de usuário comum pelo UUID.             |

---

## 🛡️ Requisitos Obrigatórios de Segurança

Todas as APIs deverão ser construídas à prova de falhas comuns, implementando as seguintes camadas:

1. **Anti-SQL Injection:** Uso exclusivo de _Prepared Statements_ / _Parameterized Queries_ nativos dos ORMs.
2. **Anti-XSS (Cross-Site Scripting):** Sanitização rigorosa de entradas de texto.
3. **CORS:** Liberação estrita (Allow-Origin) configurada apenas para a URL e porta exata onde o Front-end Angular estiver rodando.
4. **Rate Limiting (Anti-Força Bruta):** Máximo de 5 tentativas por minuto, por IP, nas rotas sensíveis (`/login` e `/forgot-password`).
5. **Hashing Seguro de Senha:** Uso de algoritmos pesados como `bcrypt` ou `Argon2id`.
6. **2FA Seguro:** Algoritmo HMAC-SHA1 com validação de expiração rígida (30 segundos) e proteção contra reutilização do mesmo token de 6 dígitos.

---

## 💻 Arquitetura do Front-end (Angular)

Sendo o único cliente do projeto, o Angular deverá ser construído de forma limpa e modularizada:

- **Interceptors HTTP:**
- `AuthInterceptor`: Anexa automaticamente o cabeçalho `Authorization: Bearer <token>` nas requisições.
- `ErrorInterceptor`: Escuta globais de erro HTTP (ex: 401 e 403) para forçar o logout ou exibir telas de "Acesso Negado".

- **Guards de Rota:** Bloqueios no lado do cliente (`AuthGuard` para áreas logadas e `AdminGuard` limitando a visualização da dashboard administrativa).
- **Formulários Dinâmicos:** Uso de _Reactive Forms_ (`FormGroup`/`FormBuilder`) para gerenciar facilmente as validações (como checagem de "Confirmar Senha" e padrões de e-mail).
- **Switch Inteligente de API:** A configuração no arquivo `environment.ts` deve permitir trocar a URL base das requisições com facilidade (ex: alternar de `http://localhost:8080` do Java para `http://localhost:8000` do PHP) para testar os back-ends sem alterar a lógica dos componentes.
