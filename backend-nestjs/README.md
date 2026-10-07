# Backend NestJS — Auth Benchmark

Este documento é um **tutorial passo a passo** de como este backend foi construído, na ordem real em que as decisões foram tomadas — incluindo os bugs genuínos encontrados no caminho (não uma versão "limpa" fictícia). O objetivo é permitir reproduzir o processo do zero, sem depender de memória, e servir de referência ao comparar com as implementações em Spring Boot e Laravel.

**API em produção:** `https://auth-benchmark-nestjs.onrender.com/api/v1` (plano gratuito: o primeiro acesso pode levar até 1 minuto).

## Stack

- **Node.js 24**, **NestJS 11**
- **Prisma 7** (ORM) com driver adapter (`@prisma/adapter-pg`)
- **PostgreSQL 16** (Docker no desenvolvimento, Neon em produção)
- **JWT** (`@nestjs/jwt`) + **Passport** (`@nestjs/passport`, `passport-jwt`)
- **bcrypt** (hash de senha e de tokens de recuperação)
- **otplib v13** (2FA / TOTP)
- **google-auth-library** (login social Google)
- **sanitize-html** (anti-XSS)
- **@nestjs/throttler** (rate limiting)
- **Brevo** via API HTTP (e-mail de recuperação de senha, usando o `fetch` nativo do Node)
- **Jest** + **Supertest** (testes unitários e e2e)
- **Docker** + **Render** (deploy da API) + **Neon** (banco)

## Pré-requisitos

- Docker Desktop instalado e aberto
- Node.js 24+
- Nest CLI (`npm install -g @nestjs/cli`)

---

## 1. Infraestrutura: Docker + PostgreSQL

Na raiz do projeto (`auth-benchmark/`), `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: admin
      POSTGRES_DB: authdb
    ports:
      - '5433:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U admin']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

**Por que a porta é `5433:5432`, não `5432:5432`:** durante o desenvolvimento, descobrimos um Postgres nativo do Windows já ocupando a porta 5432 (`netstat -ano | findstr :5432` revelou dois processos na mesma porta). Em vez de desinstalar o Postgres nativo, optamos por expor o container numa porta alternativa. **Se você for reproduzir isso, cheque sua porta 5432 antes de assumir que está livre.**

```
docker compose up -d
docker compose ps   # confirmar "(healthy)"
```

**Lembrete de rotina:** o Docker Desktop precisa estar aberto manualmente a cada reinício do Windows (a menos que configurado para autostart) — `docker compose up -d` sozinho não liga o Docker Desktop.

---

## 2. Criando o projeto Nest

```
cd auth-benchmark
nest new backend-nestjs
```

**Bug encontrado:** o `nest new` cria um repositório Git próprio dentro da pasta gerada. Como o projeto usa um único repositório Git na raiz (`auth-benchmark`), isso causa `error: 'backend-nestjs/' does not have a commit checked out` ao rodar `git add .` na raiz. **Correção:** apagar o `.git` interno logo após gerar o projeto:

```
Remove-Item -Recurse -Force backend-nestjs\.git
```

Isso se repete com qualquer gerador de projeto (Spring Initializr, Laravel installer) — checar sempre.

---

## 3. Prisma 7 — configuração (a parte mais trabalhosa)

O Prisma 7 mudou significativamente em relação a versões anteriores. Documentando cada mudança:

```
npm install prisma --save-dev
npm install @prisma/client
npx prisma init
```

### 3.1 — `DATABASE_URL` saiu do schema

Erro ao colocar `url = env("DATABASE_URL")` dentro de `datasource db` no `schema.prisma`:

```
The datasource property `url` is no longer supported in schema files.
```

**Correção:** a URL de conexão migrou para um arquivo `prisma.config.ts`, na raiz do projeto:

```typescript
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
```

O `schema.prisma` fica só com:

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}
```

`moduleFormat = "cjs"` é necessário porque o Nest compila para CommonJS por padrão, e o gerador novo do Prisma (`prisma-client`) gera ESM por padrão — sem essa linha, o Node lança `ReferenceError: exports is not defined in ES module scope` ao tentar carregar o client gerado.

### 3.2 — Driver adapter obrigatório

O Prisma 7 removeu o motor de conexão interno (Rust). Agora é preciso um adapter explícito:

```
npm install @prisma/adapter-pg pg
```

`src/prisma/prisma.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

⚠️ **Bug crítico que perdemos horas investigando:** em algum momento, uma sugestão automática do editor adicionou `passwordReset: any;` como propriedade dessa classe, tentando "silenciar" um aviso do ESLint. Isso **sobrescreve o getter real herdado de `PrismaClient`**, fazendo `this.prisma.passwordReset` virar `undefined` em runtime, mesmo o client tendo gerado tudo corretamente. O sintoma parecia um falso positivo de lint (avisos "unsafe" em cascata), mas era um bug real. **Lição: nunca declare manualmente uma propriedade com o mesmo nome de um delegate do Prisma na classe que estende `PrismaClient`.**

`src/prisma/prisma.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Registrar no `AppModule` (`imports: [PrismaModule, ...]`).

### 3.3 — Seed com admin único e idempotente

Decisão de projeto: o sistema deve ter **um único admin**, semeado desde o início, **sem nenhuma rota de promoção** de usuário comum para admin (mais seguro que a maioria dos sistemas reais).

`.env`:

```
ADMIN_NAME="Administrador"
ADMIN_EMAIL="admin@authbenchmark.com"
ADMIN_PASSWORD="senha-forte-aqui"
```

`prisma/seed.ts`:

```typescript
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME ?? 'Administrador';

  if (!adminEmail || !adminPassword) {
    throw new Error(
      'ADMIN_EMAIL e ADMIN_PASSWORD precisam estar definidos no .env',
    );
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: 'ADMIN',
    },
  });

  console.log(`Admin garantido: ${admin.email} (role: ${admin.role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

```
npm install tsx --save-dev
npx prisma db seed
```

`upsert` com `update: {}` garante idempotência: rodar múltiplas vezes nunca duplica nem falha.

**Bug encontrado depois, ao rodar `prisma migrate reset`:** o seed **não roda automaticamente** junto com o reset a menos que esteja configurado explicitamente (já está, em `prisma.config.ts`, acima) — mesmo assim, em alguns cenários (reset manual do banco) é preciso rodar `npx prisma db seed` manualmente depois, para garantir que o admin volte a existir.

**Em produção, o seed também é manual:** o container do Render só roda `migrate deploy`, não o seed. O admin de demonstração foi criado rodando o seed uma vez contra o banco do Neon (ver seção 14).

---

## 4. Modelo de dados

```prisma
model User {
  id                 String    @id @default(uuid()) @db.Uuid
  name               String
  email              String    @unique
  password           String?
  role               String    @default("USER")
  twoFactorSecret    String?   @map("two_factor_secret")
  twoFactorEnabled   Boolean   @default(false) @map("two_factor_enabled")
  twoFactorLastStep  Int?      @map("two_factor_last_step")
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  @@map("users")
}

model PasswordReset {
  id        String   @id @default(uuid()) @db.Uuid
  email     String
  tokenHash String   @map("token_hash")
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([email])
  @@map("password_resets")
}

model RefreshToken {
  id        String   @id @default(uuid()) @db.Uuid
  tokenHash String   @map("token_hash")
  userId    String   @map("user_id") @db.Uuid
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@map("refresh_tokens")
}
```

`twoFactorLastStep` guarda o último passo de tempo do TOTP já aceito (proteção contra reuso, ver seção 12). Foi adicionado numa migration própria (`add_two_factor_last_step`), que é só um `ALTER TABLE "users" ADD COLUMN "two_factor_last_step" INTEGER;`.

**Nota sobre `@db.Uuid`:** inicialmente todos os IDs foram criados como `TEXT` (o Prisma gera strings em formato UUID por padrão, sem usar o tipo nativo do Postgres). Migramos depois para `@db.Uuid` (tipo nativo), por exigência da documentação original do projeto. Como já existiam dados gravados, a migration automática do Prisma tentou **dropar e recriar as colunas** (destrutivo). Corrigimos manualmente o SQL gerado para usar conversão segura:

```sql
ALTER TABLE "users" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;
```

Sempre que uma migration envolver mudança de tipo em coluna com dados, gerar com `--create-only` e revisar o SQL manualmente antes de aplicar.

---

## 5. Ordem de implementação das funcionalidades

1. **Cadastro** (`POST /auth/register`) — DTO com `class-validator`, nome sanitizado (seção 11), hash de senha com bcrypt (salt rounds 10), proteção contra mass assignment (DTO nunca aceita `role`). **Retorna apenas o usuário criado, sem token** — o cliente precisa fazer login em seguida (decisão consciente; ver observação na seção 10 sobre por que isso pegou o frontend de surpresa).
2. **Login** (`POST /auth/login`) — JWT com `@nestjs/jwt`, mensagens de erro genéricas ("Credenciais inválidas") para e-mail inexistente e senha errada, evitando enumeração de usuários.
3. **Guards + Passport** — `JwtStrategy` valida assinatura/expiração; `JwtAuthGuard` protege rotas.
4. **RBAC** — `RolesGuard` + decorator `@Roles()` customizado, usando `Reflector`. Rotas administrativas com paginação (`skip`/`take`) e duas travas de segurança na exclusão (não deletar a si mesmo, não deletar outro admin).
5. **2FA (TOTP)** — `otplib` v13 (API baseada em classe `OTP`, diferente de versões anteriores que exportavam `authenticator` diretamente). Fluxo: `setup` (gera QR code + chave manual) → `enable` (confirma primeiro código) → `login` retorna `tempToken` intermediário se 2FA ativo → `2fa/verify` troca por JWT final. O `tempToken` carrega `stage: '2fa-pending'` no payload, e a `JwtStrategy` rejeita explicitamente qualquer token com esse campo em rotas normais. A verificação do código tem proteção contra reuso (seção 12).
6. **Recuperação de senha** — token aleatório (`crypto.randomBytes`) com hash salvo (`bcrypt`), expiração de 15 min. Mensagem de resposta sempre genérica, independente do e-mail existir. Envio de e-mail: ver seção 10.
7. **Login social Google** — abordagem escolhida: o **frontend** obtém o ID token via Google Identity Services (SDK client-side); o backend só verifica esse token (`google-auth-library`) e faz `upsert` do usuário pelo e-mail, com o nome sanitizado. Contas Google não têm senha (`password: null`) — podem posteriormente definir uma via fluxo de recuperação de senha.
8. **Refresh Token / Logout** — par de tokens no login (access token 1h, refresh token 7 dias). Hash do refresh token com **SHA-256**, não bcrypt — decisão deliberada: o token já tem alta entropia (`randomBytes(40)`, 320 bits), não precisa de hash lento; SHA-256 permite busca indexada direta (`findFirst`) em vez de varrer e comparar um por um com bcrypt (o que seria O(n) e lento). Rotação de refresh token a cada uso (`refresh` invalida o antigo e emite um novo).
9. **Perfil do usuário** (`GET /user/profile`) — inicialmente só repassava `req.user` (o payload do próprio JWT: `userId`, `email`, `role`). Ver correção na seção 9.

---

## 6. Ajustes finais de configuração

`main.ts`:

```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
app.setGlobalPrefix('api/v1');
app.enableCors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:4200',
  credentials: true,
});
app.useGlobalPipes(new ValidationPipe({ transform: true }));
await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
```

- **`trust proxy`:** necessário em produção para o rate limiting enxergar o IP real do cliente (seção 13).
- **`PORT` e `0.0.0.0`:** o Render injeta a porta pela variável `PORT` e precisa alcançar o app por fora do container.
- **`FRONTEND_URL` sem barra no final:** o navegador envia a origem sem barra, e com ela o CORS bloqueia tudo.

⚠️ **Bug sutil:** sem `transform: true`, query params (ex: `?page=1&limit=5`) chegam como **string**, não número, mesmo com `@Type(() => Number)` no DTO — o Prisma rejeita com `PrismaClientValidationError: Expected Int, provided String`. `transform: true` é o que efetivamente aplica as conversões do `class-transformer`.

Rate limiting (`@nestjs/throttler`): padrão global de 100 req/min em `app.module.ts` (`ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])`), sobrescrito para 5 req/min em `/login` e `/forgot-password` via `@Throttle()`.

---

## 7. Testes

### 7.1 — Testes unitários

```
npm run test
```

Padrão usado em todos os `*.service.spec.ts`: mock de `PrismaService`/`JwtService` via `useValue`, e `jest.mock()` para módulos externos (`bcrypt`, `otplib`, `crypto`, `google-auth-library`) — sempre declarado **no nível do arquivo**, nunca dentro de um `describe` (o hoisting do Jest não funciona corretamente dentro de blocos).

**Teste unitário não pode tocar a rede.** O `forgotPassword` chama a API do Brevo com `fetch`. Sem mock, o teste fazia uma chamada real (recebia `401` por falta de chave e, com a chave configurada, enviaria um e-mail de verdade a cada `npm test`). O teste agora faz `jest.spyOn(global, 'fetch')` num `beforeEach`, restaura num `afterEach` e verifica a URL chamada, o destinatário e o link no corpo do e-mail.

**Bugs de configuração de teste encontrados:**

- Imports com `.js` explícito gerados pelo Prisma (`./internal/class.js`) quebram a resolução do Jest — corrigido com `moduleNameMapper` no `package.json`:
  ```json
  "moduleNameMapper": { "^(\\.{1,2}/.*)\\.js$": "$1" }
  ```
- `describe`/`it`/`expect` não reconhecidos pelo editor mesmo com `@types/jest` instalado — resolvido adicionando `"types": ["jest", "node"]` explicitamente em `compilerOptions` do `tsconfig.json`.
- Imports absolutos via `baseUrl` (`from 'src/prisma/prisma.service'`) funcionam no build normal mas quebram no Jest (que já usa `rootDir: "src"`, duplicando o caminho) — usar sempre caminhos relativos (`../prisma/prisma.service`) em vez de absolutos.

**Falsos positivos conhecidos do ESLint em testes Jest** (suprimidos com `eslint-disable-next-line`, comentado com justificativa): `no-unsafe-assignment` e `no-unsafe-argument` ao usar `expect.objectContaining()` aninhado; `unbound-method` ao referenciar métodos de mocks em `expect(...).toHaveBeenCalledWith`.

**Cobertura da proteção contra reuso de TOTP** (seção 12): o instante é injetável (`nowSec`), então os testes controlam o tempo sem relógio falso. Cenários: primeiro uso aceito e passo gravado; segundo uso do mesmo código rejeitado; código do passo seguinte aceito; código inválido rejeitado sem gravar; `setup` zera o último passo.

### 7.2 — Testes e2e: a saga do Prisma 7 + Jest

Essa foi a configuração mais trabalhosa do projeto inteiro, então vale documentar em detalhe — cada tentativa fracassada ensina algo sobre por que a solução final é a que é.

**Banco de teste isolado**, no mesmo container Docker (evita poluir o banco usado em teste manual):

```powershell
docker exec -it auth-benchmark-db-1 psql -U admin -d postgres -c "CREATE DATABASE authdb_test;"
```

`.env.test` (mesma estrutura do `.env`, `DATABASE_URL` apontando para `authdb_test`):

```
DATABASE_URL="postgresql://admin:admin@localhost:5433/authdb_test"
JWT_SECRET="<mesmo secret do .env>"
ADMIN_NAME="Administrador"
ADMIN_EMAIL="admin@authbenchmark.com"
ADMIN_PASSWORD="uma-senha-forte-aqui"
```

Migrations + seed rodados manualmente contra esse banco (via `$env:DATABASE_URL=...; npx prisma migrate deploy` / `npx prisma db seed` no PowerShell). **Sempre que uma migration nova for criada, ela precisa ser aplicada também em `authdb_test`**, senão os e2e falham.

`test/setup-e2e.ts` (carrega o `.env.test` antes dos testes rodarem):

```typescript
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.test') });
```

**A tentativa que não funcionou (documentada para não repetir):** a abordagem padrão de teste e2e do Nest é instanciar a aplicação inteira dentro do processo Jest, via `Test.createTestingModule({ imports: [AppModule] }).compile()` + `createNestApplication()`. Isso **não funciona neste projeto** por causa de uma cadeia de incompatibilidades com o Prisma 7:

1. O gerador `prisma-client` do Prisma 7 usa por padrão um **motor de query em WebAssembly** (`compilerWasm`), carregado via `import()` dinâmico em runtime.
2. O sandbox de módulos do Jest **não permite `import()` dinâmico** por padrão — erro `TypeError: A dynamic import callback was invoked without --experimental-vm-modules`.
3. Habilitar `NODE_OPTIONS=--experimental-vm-modules` resolve esse erro específico, mas **quebra outras dependências** que esperam ser transformadas para CommonJS (`otplib` e sua dependência transitiva `@scure/base`), gerando `ReferenceError: exports is not defined` — o Jest, sob esse modo, tenta tratá-las como ESM real, mas o `ts-jest` as compila para CommonJS.
4. Resolver isso exigiria configuração adicional de ESM no `ts-jest` (`extensionsToTreatAsEsm`, `useESM: true`), que é frágil e, segundo relatos da comunidade, **falha especificamente no Windows** em alguns casos.

**Solução adotada:** os testes e2e **não** instanciam a aplicação dentro do Jest. Em vez disso, fazem requisições HTTP reais via `supertest` contra o backend **já rodando normalmente** (`npm run start:dev`, fora do sandbox do Jest — onde o Node lida com `import()` dinâmico nativamente, sem nenhum problema). Isso é um padrão de teste e2e legítimo e comum na indústria, com a única diferença prática de que o backend precisa estar de pé antes de rodar os testes.

`test/jest-e2e.json` (sem `moduleNameMapper` nem `transformIgnorePatterns` — não são mais necessários, já que o Prisma/otplib nunca são carregados dentro do processo Jest):

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "setupFiles": ["<rootDir>/setup-e2e.ts"]
}
```

`test/auth.e2e-spec.ts` — cobre o fluxo completo de autenticação contra `http://localhost:3000/api/v1`:

- Cadastro de novo usuário
- Login com credenciais corretas / rejeição com senha errada
- Rejeição de acesso a rota protegida sem token
- Retorno correto do perfil com token válido
- RBAC: usuário comum rejeitado em `/admin/users` (403), admin aceito (200)
- Rate limiting: 6 tentativas de login simultâneas com senha errada, confirmando que ao menos uma retorna `429`
- Rate limiting **por IP**: 6 tentativas com `X-Forwarded-For: 203.0.113.10` resultam em `429`, e uma tentativa com `X-Forwarded-For: 203.0.113.20` **não** (volta `401`), provando que cada cliente tem seu próprio contador (seção 13)

**Como rodar** (dois terminais):

```powershell
# Terminal 1
$env:DATABASE_URL="postgresql://admin:admin@localhost:5433/authdb_test"; npm run start:dev

# Terminal 2
npm run test:e2e
```

⚠️ **Nunca suba o backend com o `.env` apontando para o banco de produção e rode os e2e:** eles criam usuários de teste e consomem o limite de tentativas.

---

## 8. Segurança: brecha encontrada pós-integração com o frontend

Ao integrar o login social Google no frontend, ficou evidente que `loginWithGoogle` **nunca checava `twoFactorEnabled`** antes de emitir o token de acesso final — diferente do `login()` normal (e-mail/senha), que corretamente interrompe o fluxo e devolve um `tempToken` quando o usuário tem 2FA ativo.

**Impacto:** um usuário que ativasse 2FA continuava totalmente vulnerável a ter a conta acessada só com e-mail/senha do Google — **o 2FA podia ser contornado por completo** fazendo login social com a mesma conta de e-mail.

**Correção**, replicando exatamente a mesma lógica do login normal:

```typescript
if (usuario.twoFactorEnabled) {
  const tempToken = this.jwtService.sign(
    { sub: usuario.id, stage: '2fa-pending' },
    { expiresIn: '5m' },
  );

  return { requiresTwoFactor: true, tempToken };
}
```

**Lição:** qualquer caminho alternativo de autenticação (login social, magic link, etc.) precisa passar pelas mesmas checagens de segurança que o caminho principal — a superfície de ataque de um sistema é o caminho **mais fraco**, não o mais forte.

---

## 9. Ajuste no perfil do usuário

`GET /user/profile` originalmente só repassava `req.user` — o payload do próprio JWT (`userId`, `email`, `role`), sem consultar o banco. Isso significava que o endpoint nunca retornava `name` nem `twoFactorEnabled`, mesmo esses campos existindo no modelo `User`.

**Correção**, buscando o usuário completo:

```typescript
async getProfile(userId: string) {
  return this.prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      twoFactorEnabled: true,
    },
  });
}
```

---

## 10. Envio real de e-mail (recuperação de senha)

Em três etapas, na ordem real:

1. **Simulado:** `forgotPassword` apenas imprimia o link no console.
2. **Nodemailer + Gmail** (senha de app): funcionou em desenvolvimento.
3. **Brevo via API HTTP:** necessário no deploy. Os serviços gratuitos do Render **não conseguem enviar SMTP de saída**, então o Nodemailer deixou de funcionar em produção.

A lógica continua **direto dentro do `AuthService`**, como método privado, sem criar um `MailModule`/`MailService` separado — mantém a estrutura de pastas por domínio (auth/, user/, admin/) sem inflar com infraestrutura de suporte. Não há dependência nova: usa o `fetch` nativo do Node.

`.env`:

```
BREVO_API_KEY="xkeysib-..."
MAIL_FROM="e-mail-validado-no-brevo@exemplo.com"
FRONTEND_URL="http://localhost:4200"
```

O remetente (`MAIL_FROM`) precisa estar validado no painel do Brevo (confirmação por código enviado ao e-mail). Sem domínio próprio autenticado, mensagens de um remetente Gmail podem cair no spam — limitação documentada.

Dentro de `AuthService`:

```typescript
private async sendPasswordResetEmail(
  to: string,
  resetLink: string,
): Promise<void> {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY ?? '',
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Auth Benchmark', email: process.env.MAIL_FROM },
        to: [{ email: to }],
        subject: 'Recuperação de senha',
        htmlContent: `
          <p>Você solicitou a recuperação de senha.</p>
          <p><a href="${resetLink}">Clique aqui para redefinir sua senha</a></p>
          <p>Esse link expira em 15 minutos. Se você não solicitou isso, ignore este e-mail.</p>
        `,
      }),
    });
    if (!res.ok) console.error('Brevo error', res.status, await res.text());
  } catch (err) {
    console.error('Falha ao enviar e-mail', err);
  }
}
```

**O método não lança erro de propósito:** se o envio falhasse com exceção, a resposta de `forgot-password` mudaria para e-mails que existem, e isso revelaria quais e-mails estão cadastrados (enumeração de usuários). O erro só vai para o log.

Chamado dentro de `forgotPassword`:

```typescript
const resetLink = `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/reset-password?token=${token}&stack=nestjs`;
await this.sendPasswordResetEmail(dto.email, resetLink);
```

**Dois bugs reais que esse trecho já teve:**

- O link estava fixo em `http://localhost:4200`: em produção o usuário receberia um link que aponta para a máquina dele. Agora usa `FRONTEND_URL`.
- Sem `&stack=nestjs`, a tela de reset descobria a API pelo `localStorage`. Quem pedia o e-mail em uma stack e depois na outra, no mesmo navegador, mandava o token para a API errada e recebia "Token inválido ou expirado". Agora o link informa a stack.

---

## 11. Anti-XSS: sanitização de texto

O requisito da documentação original é sanitizar as entradas de texto. Hoje só o campo `name` passa por sanitização (os demais campos têm formato validado: e-mail, senha, códigos).

`src/common/sanitize.util.ts`:

```typescript
import sanitizeHtml from 'sanitize-html';

export function sanitizeText(input: string | null | undefined): string {
  if (!input) {
    return '';
  }
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  });
}
```

Nenhuma tag nem atributo é permitido, o mesmo comportamento do `InputSanitizer` (OWASP) do Spring. É aplicado ao `name` no cadastro e ao nome vindo do Google. Se o nome ficar vazio depois de sanitizado (por exemplo, `<script>x</script>`), a requisição é rejeitada com `400` ("O nome é obrigatório").

```
npm install sanitize-html
npm install -D @types/sanitize-html
```

O Angular também escapa a saída por padrão, então a sanitização no backend é uma segunda camada.

---

## 12. 2FA: proteção contra reuso do código

Sem proteção, o mesmo código de 6 dígitos podia ser usado várias vezes dentro da janela de validade (o TOTP aceita o passo atual e os vizinhos). A documentação original exige rejeitar o reuso.

**Desenho:** guardar no usuário o último passo de tempo aceito (`two_factor_last_step`, onde passo = `floor(epoch em segundos / 30)`). Um código só vale se o passo em que ele casou for **estritamente maior** que o último passo aceito.

`src/common/totp.util.ts`:

```typescript
import { OTP } from 'otplib';
import { PrismaService } from '../prisma/prisma.service';

const otp = new OTP();

export async function validateAndConsumeTotp(
  prisma: PrismaService,
  userId: string,
  secret: string,
  code: string,
  nowSec?: number,
): Promise<boolean> {
  if (!secret || !code) {
    return false;
  }
  const cleanCode = code.trim();
  const currentSec = nowSec ?? Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(currentSec / 30);
  const candidateSteps = [currentStep - 1, currentStep, currentStep + 1];

  let matchedStep: number | null = null;

  for (const step of candidateSteps) {
    try {
      const expectedCode = await otp.generate({ secret, epoch: step * 30 });
      if (expectedCode === cleanCode) {
        matchedStep = step;
        break;
      }
    } catch {
      // Continue checking candidate steps
    }
  }

  if (matchedStep === null) {
    return false;
  }

  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [
        { twoFactorLastStep: null },
        { twoFactorLastStep: { lt: matchedStep } },
      ],
    },
    data: {
      twoFactorLastStep: matchedStep,
    },
  });

  return result.count === 1;
}
```

Pontos importantes:

- **O `epoch` do otplib v13 é em segundos.** Foi verificado comparando `generate({ secret })` com `generate({ secret, epoch: floor(agora/30)*30 })`, que devolveram o mesmo código. Os testes unitários **não** pegariam um erro de unidade, porque geram o código esperado com a mesma função.
- **`updateMany` condicional é atômico:** se duas requisições chegarem juntas com o mesmo código, só uma consegue atualizar a linha (`count === 1`). Um `findFirst` seguido de `update` deixaria uma corrida.
- **O erro de reuso é igual ao de código inválido** ("Código de autenticação inválido"), para não revelar que o código era válido.
- **A função é usada nos dois pontos que verificam TOTP:** `enableTwoFactor` (`/user/2fa/enable`) e `verifyTwoFactor` (`/auth/2fa/verify`). O `setupTwoFactor` zera `twoFactorLastStep` ao gerar um segredo novo.
- **Janela de ±1 passo (30 s):** tolera relógio levemente dessincronizado. É uma escolha consciente, e a proteção contra reuso reduz o risco dessa folga.

---

## 13. Rate limiting atrás de proxy

Na primeira auditoria, o `@nestjs/throttler` usava `req.ip` como chave, e o app não confiava no proxy do Render. Resultado em produção: **todos os visitantes pareciam ter o mesmo IP** (o do proxy) e dividiam o mesmo contador de 5 tentativas por minuto. O `getTracker` padrão do throttler devolve `req.ip`, então a correção está no Express:

```typescript
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
```

Com `trust proxy`, o Express passa a preencher `req.ip` com o IP real do cliente, lido do `X-Forwarded-For`. O número de proxies confiáveis (`TRUST_PROXY_HOPS`, padrão `1`) pode ser ajustado sem mexer no código: um valor menor que o real faria o app ver o IP do proxy, e um valor maior abriria espaço para forjar o cabeçalho.

**Validação:**

- Teste e2e com `X-Forwarded-For` (seção 7.2).
- Em produção: errar a senha 6 vezes numa rede e receber `429`, e em seguida logar com sucesso por outra rede (dados móveis).

---

## 14. Deploy: Docker + Render + Neon

**Dockerfile** (na raiz de `backend-nestjs/`):

```dockerfile
FROM node:24-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
```

`.dockerignore`: `node_modules`, `dist`, `.env`, `.env.test`, `.git`.

**Decisões e bugs do deploy:**

- **`npm install` no lugar de `npm ci`:** o `npm ci` falhou no Linux com "Missing: @emnapi/core from lock file". O lockfile gerado no Windows não incluía dependências opcionais de outras plataformas. Limitação aceita (a instalação deixa de ser 100% reprodutível).
- **`start:prod` é `node dist/src/main`:** o build gera uma pasta `src` dentro de `dist` porque o `prisma.config.ts` na raiz é compilado junto.
- **`migrate deploy` no início do container:** aplica as migrations pendentes a cada deploy. O seed **não** roda no container.
- **Neon:** usar a connection string **direta** (sem `-pooler`) para migrations. Ela exige `sslmode=require`.
- **Porta:** o app escuta em `process.env.PORT` e `0.0.0.0` (seção 6).

**Variáveis de ambiente no Render:** `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `FRONTEND_URL` (sem barra no final), `BREVO_API_KEY`, `MAIL_FROM` e, opcionalmente, `TRUST_PROXY_HOPS`.

**Incidente de migration em produção (P3009 / P3018):** depois do push da migration `add_two_factor_last_step`, o container falhou com `P3009` ("migrate found failed migrations"), e o Render reclamava de "No open ports". O log mostrou o erro de fundo: `column "two_factor_last_step" of relation "users" already exists` (`42701`). A coluna já estava no banco do Neon antes do deploy, e o Prisma tentou criá-la de novo e marcou a migration como falha. O Prisma se recusa a aplicar qualquer migration enquanto houver uma marcada como falha.

Correção, com a connection string do Neon só na sessão do PowerShell:

```powershell
$env:DATABASE_URL='<string direta do Neon>'
npx prisma migrate resolve --applied 20261004025913_add_two_factor_last_step
npx prisma migrate status    # "Database schema is up to date!"
Remove-Item Env:DATABASE_URL
```

Depois, novo deploy manual no Render. (`--rolled-back` seria o comando errado: a coluna existia, e o deploy tentaria criá-la de novo.)

**Lição:** não rode `migrate dev`, `migrate deploy` nem o seed com o `.env` apontando para o banco de produção. Prefira passar a `DATABASE_URL` só no comando que precisa dela, e olhe o host antes de executar. Quando uma migration "falha" em produção, descubra primeiro o estado real do banco (a coluna existe ou não?) antes de escolher entre `--applied` e `--rolled-back`.

---

## 15. Limitações conhecidas

- **Secret do 2FA em texto puro** no banco. A evolução prevista é criptografá-lo (AES-256-GCM, chave em variável de ambiente).
- **Rate limiting em memória** (armazenamento padrão do throttler): zera a cada reinício e não é compartilhado entre instâncias. Um cenário multi-instância exigiria Redis.
- **Sanitização só no campo `name`.**
- **`refresh` concorrente:** se duas requisições chegarem juntas com o mesmo refresh token, a segunda falha no `delete` (registro já removido) e a API responde `500` em vez de `401`. Não há detecção de reuso de token: um token já rotacionado é apenas recusado, sem invalidar os demais.
- **`RefreshToken` sem `@relation` com `User`:** o Prisma não garante `cascade delete`, então refresh tokens de um usuário excluído ficam órfãos na tabela.
- **`verifyTwoFactor` não emite refresh token** (só `access_token`): contas com 2FA ativo têm sessão de 1 h sem renovação.
- **Janela do TOTP de ±1 passo** (seção 12).
- **Plano gratuito do Render:** a API dorme após 15 minutos sem uso, e o primeiro acesso leva até 1 minuto.

---

## 16. Comandos de inicialização (checklist de retomada)

```powershell
# 1. Abrir o Docker Desktop manualmente
# 2. Na raiz do projeto:
docker compose up -d
docker compose ps   # confirmar "(healthy)"

# 3. No backend-nestjs (com o .env apontando para o banco LOCAL):
npm run start:dev
```

Para rodar os testes e2e, ver seção 7.2 (banco de teste separado + backend rodando em paralelo). Para publicar, ver a seção 14.
