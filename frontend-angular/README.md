# Frontend Angular — Auth Benchmark

Este documento é um **tutorial passo a passo** de como este frontend foi construído, na ordem real em que as decisões foram tomadas — incluindo os bugs genuínos encontrados no caminho (não uma versão "limpa" fictícia). O objetivo é permitir reproduzir o processo do zero, sem depender de memória, e servir de referência ao comparar com as implementações em NestJS e Spring Boot.

**Aplicação em produção:** https://auth-benchmark.vercel.app/

## Stack

- **Angular 21.2** (`@angular/core ^21.2.0`, CLI `^21.2.24`, standalone components, sem NgModules, modo **zoneless**)
- **Tailwind CSS v4** (`tailwindcss ^4.1.12`, integração nativa do Angular CLI + `tailwindcss-primeui ^0.6.1`)
- **PrimeNG 21** (`primeng ^21.1.10`, `@primeuix/themes ^3.0.0` para tokens de design)
- **RxJS 7.8** (Observables, `tap`, `map`)
- **Reactive Forms**
- **simple-icons 16** (ícones de marca das stacks)
- **Google Identity Services** (OAuth)
- **Vitest 4** (testes unitários de guards, interceptor e `jwt.util`, runner nativo do Angular CLI 21)
- **Deploy**: Vercel (frontend), Render (backends)

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

O arquivo `app.spec.ts` gerado automaticamente pelo `ng new` foi removido — ele testa apenas se o componente raiz renderiza (procurando um `<h1>` "Hello, frontend-angular" que não existe no app), o que não acrescenta nada ao projeto e deixava um teste vermelho no repositório.

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
├── core/
│   ├── auth/                       (AuthService, GoogleAuthService, authGuard, adminGuard,
│   │                                authInterceptor, errorInterceptor, jwt.util)
│   ├── admin/                      (AdminService)
│   └── warmup/                     (WarmupService — aviso de cold start)
├── shared/
│   └── warmup-banner/              (banner exibido no componente raiz)
├── environments/                   (apiUrls por stack, googleClientId)
└── features/
    ├── landing/
    ├── auth/
    │   ├── login-form/
    │   ├── register-form/
    │   ├── forgot-password/        (componente único, `stack` vem de route data)
    │   ├── reset-password/         (`stack` vem do parâmetro ?stack= do link do e-mail)
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
- **Envio de e-mail de recuperação**: inicialmente simulado via `console.log`/`System.out.println`; depois enviado por SMTP do Gmail (Nodemailer no NestJS, `JavaMailSender` no Spring Boot). No deploy, o plano gratuito do Render **bloqueia SMTP de saída**, então as duas stacks passaram a usar a **API HTTP do Brevo**, como método privado direto no `AuthService` (sem module/service novo, por decisão de manter a estrutura simples).

## 8. Bugs reais do próprio Angular (zoneless)

O projeto roda em modo **zoneless** (sem Zone.js, padrão do Angular 21+). Isso mudou dois pontos que funcionariam "por acidente" em versões anteriores:

- **`NG0100 ExpressionChangedAfterItHasBeenCheckedError`**: `users-table` usava propriedades simples (`users`, `totalRecords`, `loading`) atualizadas dentro de um `.subscribe()` assíncrono. Sem Zone.js, o Angular não percebe a mudança automaticamente. Corrigido convertendo tudo para `Signal`.
- **Mensagens de erro atrasadas**: mesmo problema em `errorMessage` nos shells — uma propriedade comum reatribuída de forma assíncrona só refletia na tela no _próximo_ ciclo de detecção (ex: só depois de digitar de novo no campo). Corrigido com `signal('')` + `.set()`.

**Lição geral**: em modo zoneless, qualquer estado que muda fora de um evento de template (dentro de um `.subscribe()`, `setTimeout`, etc.) precisa ser um `Signal` — nunca uma propriedade de classe comum.

## 9. Funcionalidades implementadas (paridade completa nas duas stacks)

- Landing page com seleção de stack (cards com ícone via `simple-icons`, cor de marca, hover)
- Login e Cadastro (Reactive Forms, validação cruzada de senha via validador de `FormGroup`)
- JWT + rotas protegidas (`authGuard`, `adminGuard`, `authInterceptor` anexando `Authorization: Bearer` automaticamente, `errorInterceptor`)
- RBAC: usuário ADMIN vai para o dashboard (tabela de usuários paginada, exclusão, busca **não implementada** — backend não suporta parâmetro de busca); usuário comum vai para o perfil próprio
- 2FA completo: ativação (QR code + código) e desafio no login (`requiresTwoFactor`/`tempToken`)
- OAuth Google (Google Identity Services), incluindo o desafio de 2FA quando aplicável
- Recuperação de senha (tela dedicada, token e stack via URL, envio de e-mail real)
- Dashboard de admin responsivo (tabela no desktop, cards no celular)
- Aviso de cold start dos servidores gratuitos, com status por stack

## 10. Guards, interceptors e expiração do JWT

Depois de uma revisão de código, ficou claro que o front só tinha `authGuard` (que apenas conferia se havia um token) e `authInterceptor`. Faltavam o tratamento global de erros e a checagem de expiração, que a documentação original do projeto previa. Sem isso, depois de 1 hora o token expirava e o usuário ficava preso numa tela que só mostrava erros.

**Lembrete:** guards e interceptors do Angular **não são segurança** — a autorização real é do backend. Eles existem para a experiência de uso (não mostrar telas que vão falhar).

**`jwt.util.ts`** (sem biblioteca): `decodePayload(token)` converte o payload base64url em objeto (devolve `null` se o token for inválido) e `isExpired(token)` devolve `true` se o token não decodifica, não tem `exp` ou já passou (`exp * 1000 <= Date.now()`).

**`authGuard`:** além de conferir a presença do token, usa `isExpired`. Se o token está ausente ou expirado, chama `authService.logout()` e redireciona para `/`.

**`adminGuard`:** deixa passar só quem tem token válido e `role === 'ADMIN'`. Quem está logado mas não é admin vai para o perfil da stack ativa; quem está sem token ou com token expirado faz logout e volta para `/`. É aplicado, junto com o `authGuard`, nas rotas `nestjs/dashboard` e `springboot/dashboard`.

**`errorInterceptor`**, registrado em `app.config.ts` depois do `authInterceptor` (`withInterceptors([authInterceptor, errorInterceptor])`):

- **Ignora** requisições cuja URL contém `/auth/`. Sem isso, errar a senha no login (que devolve `401`) deslogaria o usuário e redirecionaria a tela.
- Nas demais rotas, desloga e volta para `/` em `401`, ou em `403` **quando o token local está ausente ou expirado**. Um `403` com token válido é só repassado (o componente mostra a mensagem, como o `users-table` faz para falta de permissão).
- Sempre repassa o erro (`throwError`), para os componentes continuarem tratando.
- **Por que o `403` precisa da checagem local:** o Spring responde `403` (não `401`) para token inválido ou ausente. Só olhar o status `401` não bastaria para detectar a expiração nessa stack.

**`AuthService.logout()`** remove `accessToken`, `activeStack` e `resetStack` do `localStorage`.

## 11. Recuperação de senha: a stack vem no link

A tela de reset precisa saber para **qual API** enviar o token. A primeira versão guardava a stack no `localStorage` (`resetStack`) no momento em que o usuário pedia o e-mail. Bug real, descoberto em produção: quem pedia a recuperação numa stack e depois na outra, **no mesmo navegador**, tinha o `resetStack` sobrescrito, e o link do e-mail da primeira stack mandava o token para a API da segunda. Resultado: `400 "Token inválido ou expirado"`, mesmo com o token correto. Na aba Network do DevTools, a requisição de `reset-password` ia para o domínio errado. Também falharia para quem abrisse o e-mail em outro navegador ou no celular.

**Correção:** o link do e-mail carrega a stack (`?token=...&stack=nestjs` ou `stack=springboot`), gerado pelos dois backends. O `ResetPassword` lê os dois parâmetros e **valida** a stack contra a lista de duas opções (ela vem da URL e escolhe qual API recebe o token, então um valor qualquer é ignorado). O `localStorage` ficou só como plano B para links antigos:

```typescript
const stackFromUrl = params.get('stack');
if (stackFromUrl === 'nestjs' || stackFromUrl === 'springboot') {
  this.stack.set(stackFromUrl);
} else {
  const saved = this.authService.getResetStack();
  this.stack.set(saved === 'springboot' ? 'springboot' : 'nestjs');
}
```

## 12. Dashboard de admin responsivo

No celular, a tabela de usuários era mais larga que a tela: "Cadastro" e "Ações" ficavam escondidos e aparecia uma rolagem horizontal dentro do card. O `p-16` (64 px de cada lado) agravava, consumindo mais de 30% de uma tela de 390 px.

**Correção:**

- **Padding responsivo** nos dois dashboards: `p-4 sm:p-8 md:p-16`.
- **`users-table` com dois layouts:** a tabela PrimeNG num container `hidden md:block` (desktop) e uma lista de cards num container `md:hidden` (celular), com nome, e-mail (com `break-all`), data e botão de excluir.
- **Paginador no celular:** o Spring já usava o paginador próprio (`customPaginator`). No NestJS, o paginador nativo do `p-table` some junto com a tabela no celular, então o paginador próprio também aparece lá, via `[class]="customPaginator ? '' : 'md:hidden'"`.

**Contador "Mostrando N de total":** a primeira versão mostrava `rangeStart`, o que dava textos como "1 de 6" na primeira página e "6 de 6" na segunda, confusos. Uma segunda tentativa mostrou o intervalo de posições (`1–5`, `6–10`), que não era o que se queria. O comportamento desejado é a **quantidade de usuários na tela**: `Mostrando {{ users().length }} de {{ totalRecords() }} usuários` ("5 de 6" na primeira página e "1 de 6" na segunda). O `rangeEnd` continua sendo usado para desabilitar o botão "Próximo".

## 13. Ambientes e deploy na Vercel

**Dois arquivos de ambiente**, trocados pelo Angular CLI:

- `src/environments/environment.ts` — **produção** (usado por `ng build`): `production: true` e as URLs das APIs no Render.
- `src/environments/environment.development.ts` — **desenvolvimento** (usado por `ng serve`): `production: false` e as URLs `localhost`.

A troca é feita pelo `fileReplacements` no `angular.json`, **dentro da configuração `development`** (`architect → build → configurations → development`):

```json
"development": {
  "optimization": false,
  "extractLicenses": false,
  "sourceMap": true,
  "fileReplacements": [
    {
      "replace": "src/environments/environment.ts",
      "with": "src/environments/environment.development.ts"
    }
  ]
}
```

**Bug real:** o conteúdo dos dois arquivos foi trocado de lugar. O build de produção saiu com `production: false` e as URLs de `localhost`, e o site publicado tentava falar com `localhost:8080` (`ERR_CONNECTION_REFUSED`). Foi diagnosticado procurando `localhost:8080` no bundle de produção (`dist/.../*.js`). Se o `fileReplacements` estivesse na configuração `production`, o efeito seria o mesmo. **Lição:** depois de mexer em ambientes, confira o artefato (`npm run build` e uma busca por `localhost` na saída), não só o código-fonte.

**Budgets do bundle:** o `ng build` de produção falhou com `bundle initial exceeded maximum budget` (erro acima de 1 MB). O PrimeNG deixa o bundle inicial em cerca de 1,15 MB, mas o tamanho **transferido** (comprimido) é de cerca de 224 kB, o que é o que o usuário baixa. Os limites do `angular.json` foram ajustados para aviso em 1,5 MB e erro em 2 MB:

```json
{ "type": "initial", "maximumWarning": "1.5MB", "maximumError": "2MB" }
```

**Vercel:**

- `vercel.json` na raiz do projeto Angular, para o F5 numa rota interna (como `/nestjs/dashboard`) não dar `404`, já que é uma SPA:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

- Configuração do projeto: **Root Directory** `frontend-angular`, **Build Command** `npm run build`, **Output Directory** `dist/frontend-angular/browser`. Não há variáveis de ambiente, porque as URLs das APIs estão no `environment.ts`.
- Do lado das APIs: `FRONTEND_URL` nos dois serviços do Render com a URL da Vercel, **sem barra no final** (para o CORS), e a origem da Vercel autorizada em **Origens JavaScript autorizadas** no Google Cloud Console (para o login com Google).

## 14. Cold start dos servidores gratuitos

Os backends rodam em planos gratuitos do Render e "dormem" após 15 minutos sem uso: o primeiro acesso a cada API leva até 1 minuto. Para o usuário não achar que o site está quebrado, o front dispara uma requisição "acordando" as duas APIs ao abrir e mostra um aviso até as duas responderem.

- **`WarmupService`** (`core/warmup/`): dois signals (`nestjs` e `springboot`, valores `'waking'` ou `'ready'`). Faz um `fetch` para a raiz de cada API e repete a cada 3 segundos enquanto falhar. Em desenvolvimento (`environment.production === false`) marca tudo como pronto, pois os backends locais não dormem.
- **Como detecta "acordou":** o `fetch` é feito em modo CORS comum. Quando o app responde, ele devolve cabeçalhos CORS (mesmo num `404` ou `403`), e a promessa resolve. A página de "carregando" do Render não tem esses cabeçalhos, então o `fetch` falha e o serviço tenta de novo.
- **`WarmupBanner`** (`shared/warmup-banner/`): componente com template inline, fixado na parte de baixo da tela, que mostra o status de cada stack e some quando as duas estão prontas. Fica no componente raiz (`app.html`), então também aparece para quem abre direto um link como `/nestjs`.

## 15. Testes

Testes unitários com **Vitest** (runner nativo do Angular CLI 21), em `core/auth/`:

- `jwt.util.spec.ts` — decodificação e expiração.
- `auth.guard.spec.ts` e `admin.guard.spec.ts` — redirecionamentos e logout.
- `error.interceptor.spec.ts` — ignora `/auth/`, desloga em `401` e em `403` com token expirado, e repassa o erro.

```bash
npm test -- --watch=false
```

## 16. Limitações conhecidas (decisões conscientes, não esquecimentos)

- **O front não usa o refresh token:** o `saveSession` guarda só o access token, e o refresh token devolvido no login é descartado. A sessão dura o tempo do access token (1 h), e depois o usuário volta ao login.
- **O logout é local:** `AuthService.logout()` só limpa o `localStorage` e não chama `/auth/logout`. O refresh token continua válido no servidor até expirar (7 dias).
- **Token no `localStorage`:** simples, mas exposto a XSS. A alternativa mais robusta seria cookie `HttpOnly` com proteção CSRF.
- **Checagem de expiração só no cliente:** o `authGuard` valida o `exp` do JWT localmente, o que melhora a experiência, mas não é segurança. A validação real é do backend.
- **Login Google (One Tap):** não funciona em janelas anônimas ou sem sessão Google no navegador (`FedCM` falha com "Provider's accounts list is empty"). A alternativa seria o botão oficial do Google.
- **Busca no dashboard de admin não implementada:** o backend não suporta parâmetro de busca.
- **Bundle inicial grande (~1,15 MB):** reflexo do PrimeNG. O tamanho transferido é de ~224 kB, e os budgets foram ajustados de acordo.
- **Presets de tema** (`nestjs.preset.ts`) continuam no código, mas não são mais usados em runtime — a cor é resolvida via `[dt]`/`@Input()` por componente.
- **Backend Laravel:** ainda não iniciado, por decisão deliberada de validar a arquitetura do frontend primeiro.
