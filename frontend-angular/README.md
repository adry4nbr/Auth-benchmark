# Frontend Angular — Auth Benchmark

Este documento é um **tutorial passo a passo** de como este frontend foi construído, na ordem real em que as decisões foram tomadas — incluindo os bugs genuínos encontrados no caminho (não uma versão "limpa" fictícia). O objetivo é permitir reproduzir o processo do zero, sem depender de memória, e servir de referência ao comparar com as implementações em NestJS e Spring Boot.

## Stack

- **Angular 21** (CLI, standalone components, sem NgModules)
- **Tailwind CSS v4** (integração nativa do Angular CLI + `tailwindcss-primeui`)
- **PrimeNG 21** (`@primeuix/themes` para tokens de design)
- **RxJS** (Observables, `tap`, `map`)
- **Reactive Forms**
- **simple-icons** (ícones de marca das stacks)
- **Google Identity Services** (OAuth)

## Objetivo do frontend

Validar a arquitetura de desacoplamento do benchmark: **um único frontend**, capaz de consumir **qualquer um dos backends** (NestJS, Spring Boot, e futuramente Laravel) trocando apenas a URL base e normalizando os contratos divergentes dentro dos `services` — nunca vazando essas diferenças para os componentes visuais.

Decisão consciente tomada antes de começar: construir o frontend **antes** do terceiro backend (Laravel), para (1) evitar meses sem nenhuma interface visual e (2) validar que a arquitetura de múltiplos backends intercambiáveis funciona na prática antes de investir num quarto/terceiro backend sobre uma fundação não testada.

## 1. Fundamentos do Angular

Antes de qualquer código do projeto real, foram praticados isoladamente (num componente descartável `teste/`, depois removido):

- **Component**: anatomia (`@Component`, `selector`, `templateUrl`, `styleUrl`, `imports`), geração via `ng generate component`, composição (import da classe + array `imports` + uso do `selector` no template).
- **Signal**: `signal(valor)`, leitura via `()`, escrita via `.set()`.
- **Data binding**: interpolação `{{ }}`, Property Binding `[ ]`, Event Binding `( )`.

Paralelo conceitual usado durante o ensino (Angular ↔ NestJS): Module↔Standalone Component, Guard↔Guard, Interceptor↔Interceptor, DI via constructor/`inject()`↔DI via constructor.

## 2. Scaffolding

```bash
npm install -g @angular/cli
ng new frontend-angular
```

Decisões no prompt interativo: stylesheet **Tailwind CSS** (opção nativa do CLI 21+, já configura PostCSS automaticamente), **sem SSR/SSG**, **sem ferramentas de IA** configuradas (o fluxo de trabalho é ensino + revisão manual, não geração autônoma).

## 3. PrimeNG — bugs reais de integração

### Bug 1 — pacote de temas renomeado

`@primeng/themes` (usado em tutoriais/versões antigas) não existe mais a partir da v20/v21. O pacote correto é:

```bash
npm install primeng @primeuix/themes
```

### Bug 2 — `ng add primeng` não configura nada

Diferente de outros pacotes, `ng add primeng` só instala a dependência — não registra o provider. Configuração manual necessária em `app.config.ts`:

```typescript
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';

providePrimeNG({
  theme: {
    preset: Aura, // nunca um array — só um preset por vez
    options: {
      darkModeSelector: false, // evita conflito com o modo escuro do SO
    },
  },
}),
```

`darkModeSelector: false` é necessário porque o PrimeNG, por padrão, detecta o modo escuro do sistema operacional e sobrescreve tokens de superfície (fundo de input, cor de texto) — competindo com o Tailwind e causando inputs pretos/labels invisíveis mesmo em telas claras.

### Bug 3 — Tailwind v4 não usa `@layer` manual

A receita para Tailwind v3 (`@layer tailwind, primeng;` + `cssLayer` customizado no `providePrimeNG`) **não se aplica à v4**. A integração oficial e correta para v4 é:

```bash
npm install tailwindcss-primeui
```

```css
/* styles.css */
@import 'tailwindcss';
@import 'tailwindcss-primeui';
```

Sem nenhuma declaração de `@layer` manual e sem `options.cssLayer` no `providePrimeNG`.

### Bug 4 — `pTemplate` sem import quebra silenciosamente

`pTemplate` é a diretiva `PrimeTemplate`, exportada de `primeng/api`. Como qualquer peça do PrimeNG em um projeto standalone, precisa estar no array `imports` do componente — sem isso, os `<ng-template pTemplate="...">` simplesmente não renderizam, sem erro no console.

## 4. Design tokens e cor por stack

### Tentativa fracassada: `usePreset` (troca de tema em runtime)

A API "oficial" para trocar o preset ativo dinamicamente (`usePreset` de `@primeuix/themes`) está **confirmadamente quebrada no Angular a partir da v20/v21** — bug relatado na própria issue tracker do PrimeNG ("primeng v20 angular usePreset not working"), sem fix até o momento. Funcionava na v19. **Não usar.**

### Tentativa fracassada: CSS Custom Property herdada

A segunda tentativa foi sobrescrever `--p-primary-color` no `:host` de cada shell, herdando via cascata CSS normal (que atravessa a View Encapsulation do Angular, já que ela não usa Shadow DOM real). Também não funcionou: componentes como o `Button` **pré-calculam** seus próprios tokens (`--p-button-primary-background`) em vez de referenciar `--p-primary-color` dinamicamente — sobrescrever a variável de origem não se propaga.

### Solução real: `[dt]` (scoped design tokens) + `@Input()`

Cada componente PrimeNG aceita um input `[dt]` que sobrescreve tokens **só daquela instância**, com prioridade garantida sobre o preset global:

```typescript
protected get buttonTokens() {
  return {
    background: this.accentColor,
    hoverBackground: this.hoverColor,
    activeBackground: this.activeColor,
    borderColor: this.accentColor,
    hoverBorderColor: this.hoverColor,
    activeBorderColor: this.activeColor,
    color: '#ffffff',
    primary: { /* mesma estrutura, aninhada — Button tem um nível extra que Card não tem */ },
  };
}
```

```html
<p-button type="submit" label="Entrar" [dt]="buttonTokens" />
```

Componentes reutilizáveis (`login-form`, `register-form`, `users-table`) recebem cor via `@Input()` (`accentColor`, `hoverColor`, `inputBg`, `headerBg`, etc.), aplicada via `[dt]`. Isso permite que cada shell (NestJS, Spring Boot, e futuramente Laravel) "pinte" o mesmo componente sem duplicar lógica.

**Exceção — `p-password`**: o token schema do componente Password não tem `background`/`borderColor` próprios (só tokens de força/ícone/overlay) — ele reaproveita as variáveis do InputText internamente. Nesse caso específico, a correção é `[style]` com CSS custom properties escopadas no próprio elemento:

```html
<p-password
  [style]="{
  '--p-inputtext-background': inputBg,
  '--p-inputtext-border-color': inputBorder,
  '--p-inputtext-hover-border-color': accentColor,
  '--p-inputtext-focus-border-color': accentColor
}"
/>
```

**Mesma técnica para o Paginador**: o `Paginator` é um componente global separado do `DataTable` (`--p-paginator-*`, não `--p-datatable-paginator-*`) — o grupo `paginator: {...}` dentro do `[dt]` da tabela é ignorado. Correção via `[style]` no host da `<p-table>`, que cascateia para o paginador como descendente no DOM.

**Tokens de tabela são aninhados, não flat**: diferente do Card (`{ background, color }`), o `Table` usa grupos (`header`, `headerCell`, `row`, `bodyCell`, `footer`) — cada um com seus próprios sub-tokens.

### Reset de arquitetura

No meio da tentativa de tema dinâmico, o projeto foi revertido via `git reset --hard` até o commit anterior (shell do NestJS já finalizado), para descartar as tentativas fracassadas e reconstruir o Spring Boot direto pela via `[dt]` — decisão consciente de "recomeçar limpo" em vez de empilhar remendos.

## 5. Arquitetura de componentes

Duas camadas separando **conteúdo** de **apresentação**:

- **Shell** (`features/auth/shells/{nestjs,springboot}-shell/`): a "moldura" visual específica de cada stack (terminal escuro/glow vermelho para NestJS; split-screen/card claro para Spring Boot).
- **Conteúdo reutilizável** (`login-form`, `register-form`, `users-table`): componentes "burros", sem saber qual stack os está usando, comunicando-se com o pai via `@Input()`/`@Output()`.

```
src/app/
├── theme/                          (presets — hoje não usados em runtime, mas mantidos)
├── core/auth/                      (AuthService, GoogleAuthService, authGuard, authInterceptor)
├── core/admin/                     (AdminService)
├── environments/                   (apiUrls por stack, googleClientId)
└── features/
    ├── landing/
    ├── auth/
    │   ├── login-form/
    │   ├── register-form/
    │   ├── forgot-password/        (componente único, `stack` vem de route data)
    │   ├── reset-password/
    │   └── shells/{nestjs,springboot}-shell/
    ├── admin/
    │   ├── users-table/
    │   └── {nestjs,springboot}-dashboard/
    └── profile/
        └── {nestjs,springboot}-profile/
```

## 6. Normalização de contratos divergentes

Os dois backends têm formatos de resposta diferentes para os mesmos endpoints. A regra seguida: **a diferença nunca vaza para os componentes** — é resolvida dentro dos `services`, usando `RxJS map` (transforma o Observable) e type guards (`'campo' in response`).

| Endpoint              | NestJS                                                                                       | Spring Boot                                     |
| --------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Login                 | `{ access_token, refresh_token }`                                                            | `{ token, refreshToken, user }`                 |
| Paginação de usuários | `{ data, total, page, limit }`                                                               | `{ data, totalItems, totalPages, currentPage }` |
| Perfil                | `{ userId, email, role }` (corrigido para incluir `name`/`twoFactorEnabled`, ver bug abaixo) | `{ id, name, email, role, twoFactorEnabled }`   |

Ambas as stacks usam prefixo de rota `/api/v1`.

## 7. Bugs reais de backend descobertos a partir do frontend

Vários bugs só apareceram ao testar o fluxo real ponta a ponta — não eram visíveis olhando o backend isoladamente:

- **`/auth/register` não retorna token** (nas duas stacks) — só confirma a criação do usuário. O front precisou encadear `register → login explícito → getProfile → navegação`, em vez de assumir sessão automática.
- **`/user/profile` do NestJS não retornava `name`** — só repassava o payload do JWT (`userId`, `email`, `role`). Corrigido no backend para buscar o usuário completo via `findUnique` + `select`.
- **Seed do Prisma não roda automaticamente com `prisma migrate reset`** — precisa configuração explícita no `package.json`, ou rodar `npx prisma db seed` manualmente.
- **Brecha de segurança real**: `loginWithGoogle` (nas duas stacks) não checava `twoFactorEnabled` antes de emitir token, permitindo contornar 2FA inteiramente via login social com o mesmo e-mail. Corrigido replicando a mesma lógica de `tempToken`/`requiresTwoFactor` do login normal.
- **`/auth/2fa/verify` não estava na lista de rotas públicas do `SecurityConfig` do Spring** — causava `403 Forbidden` mesmo com um `tempToken` válido, porque o `JwtAuthenticationFilter` barrava a requisição antes do controller. Corrigido adicionando a rota a `permitAll()`.
- **Envio de e-mail de recuperação**: inicialmente simulado via `console.log`/`System.out.println`. Substituído por envio real — Nodemailer + Gmail (senha de app) no NestJS, `spring-boot-starter-mail` + `JavaMailSender` no Spring Boot — ambos como método privado direto no `AuthService` (sem module/service novo, por decisão de manter a estrutura simples).

## 8. Bugs reais do próprio Angular (zoneless)

O projeto roda em modo **zoneless** (sem Zone.js, padrão do Angular 21+). Isso mudou dois pontos que funcionariam "por acidente" em versões anteriores:

- **`NG0100 ExpressionChangedAfterItHasBeenCheckedError`**: `users-table` usava propriedades simples (`users`, `totalRecords`, `loading`) atualizadas dentro de um `.subscribe()` assíncrono. Sem Zone.js, o Angular não percebe a mudança automaticamente. Corrigido convertendo tudo para `Signal`.
- **Mensagens de erro atrasadas**: mesmo problema em `errorMessage` nos shells — uma propriedade comum reatribuída de forma assíncrona só refletia na tela no _próximo_ ciclo de detecção (ex: só depois de digitar de novo no campo). Corrigido com `signal('')` + `.set()`.

**Lição geral**: em modo zoneless, qualquer estado que muda fora de um evento de template (dentro de um `.subscribe()`, `setTimeout`, etc.) precisa ser um `Signal` — nunca uma propriedade de classe comum.

## 9. Funcionalidades implementadas (paridade completa nas duas stacks)

- Landing page com seleção de stack (cards com ícone via `simple-icons`, cor de marca, hover)
- Login e Cadastro (Reactive Forms, validação cruzada de senha via validador de `FormGroup`)
- JWT + rotas protegidas (`authGuard`, `authInterceptor` anexando `Authorization: Bearer` automaticamente)
- RBAC: usuário ADMIN vai para o dashboard (tabela de usuários paginada, exclusão, busca **não implementada** — backend não suporta parâmetro de busca); usuário comum vai para o perfil próprio
- 2FA completo: ativação (QR code + código) e desafio no login (`requiresTwoFactor`/`tempToken`)
- OAuth Google (Google Identity Services), incluindo o desafio de 2FA quando aplicável
- Recuperação de senha (tela dedicada, token via URL, envio de e-mail real)

## 10. Pendências conhecidas (decisões conscientes, não esquecimentos)

- Backend Laravel: ainda não iniciado, por decisão deliberada de validar a arquitetura do frontend primeiro.
- Presets de tema (`nestjs.preset.ts`) continuam no código, mas não é mais usados em runtime — a cor é resolvida via `[dt]`/`@Input()` por componente.
