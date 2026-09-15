# Roadmap — Frontend Angular (auth-benchmark)

> Documento de planejamento. Não contém código — serve para orientar a sequência de aprendizado e construção a partir do front-end.

## Contexto e decisão de stack visual

- **Framework**: Angular (CLI mais recente, standalone components).
- **HTTP Client**: `HttpClient` nativo do Angular (RxJS/Observables) — sem Axios.
- **Estilização estrutural/componentes**: **PrimeNG** (biblioteca de componentes prontos: tabelas, tabs, inputs, cards, etc).
- **Estilização de ajuste/layout**: **Tailwind CSS** (já dominado pelo usuário via React/Next) — usado apenas para espaçamento, grid e ajustes ao redor dos componentes PrimeNG, não para sobrescrever a aparência interna deles.
- **Motivo da escolha do PrimeNG sobre Angular Material**: catálogo mais rico (tabelas com filtro/paginação prontas, úteis para as telas de admin/RBAC) e visual mais alinhado ao que o usuário quer para o portfólio.

## Conceito-chave que viabiliza o design das 3 stacks: Design Tokens / Presets

Cada stack (NestJS, Spring Boot, Laravel) terá sua própria identidade visual (cores, bordas, tipografia), mas reaproveitando a **mesma estrutura de componentes**. Isso é possível porque o PrimeNG (v18+) separa:

- **Estrutura do componente** (ex: `<p-table>`, `<p-tabs>`, `<p-inputtext>`) — construída uma única vez.
- **Preset de design tokens** — um arquivo de configuração por stack, definindo cor primária, fundo, bordas etc. Trocar o preset ativo re-skina o sistema inteiro sem duplicar telas.

Isso substitui a abordagem de "3 telas de login diferentes" por "1 tela de login + 3 presets de tema" selecionados dinamicamente pela stack escolhida.

## Divisão de responsabilidades de estilo

| Camada                                | Ferramenta                     | Exemplo                                                        |
| ------------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| Identidade visual da stack            | Preset PrimeNG (design tokens) | Verde Spring vs. vermelho-escuro Laravel vs. terminal NestJS   |
| Estrutura/comportamento do componente | PrimeNG                        | Tabela de usuários, cards de estatística, tabs de autenticação |
| Layout ao redor                       | Tailwind (utility classes)     | Grid, espaçamento, posicionamento                              |

## Sequência de aprendizado e construção

1. **Fundamentos do Angular puro** — componentes, templates, data binding, services, dependency injection. Tela simples sem estilização, só para sentir o framework sem ruído visual.
2. **Angular CLI + criação do projeto** — instalação, `ng new`, entendimento da estrutura de pastas gerada.
3. **Instalação e configuração do Tailwind CSS** no projeto Angular (integração via `angular.json`/PostCSS — diferente do setup em Next.js).
4. **Instalação e configuração do PrimeNG** — `providePrimeNG`, entendimento do preset padrão (Aura) antes de customizar.
5. **Design tokens na prática** — customizar cores de um preset existente (exercício isolado, sem ligar ainda à lógica de troca de stack).
6. **Arquitetura de troca de tema por stack** — 3 presets (NestJS/Spring/Laravel) + seleção dinâmica do tema conforme a stack escolhida na landing page.
7. **Routing + estrutura de páginas** — landing → seleção de stack → login/cadastro → dashboard admin.
8. **Reactive Forms** — telas de login, cadastro, 2FA, recuperação de senha.
9. **HttpClient + Interceptors + Guards** — conexão real com as APIs, anexação automática de JWT, proteção de rotas no front (reforçando que isso é UX, não segurança real — a autorização de fato é no backend).
10. **Integração feature por feature com os backends reais** — login → JWT → rotas protegidas → RBAC → 2FA → OAuth Google → recuperação de senha, replicando o que já foi validado manualmente em NestJS e Spring Boot.

## Observações importantes já alinhadas

- O frontend deve permanecer desacoplado da implementação específica de cada backend, trocando a API consumida via configuração do projeto.
- Guards e validações do Angular não substituem autorização no backend.
- O objetivo do frontend, nesta fase, é validar a arquitetura de desacoplamento (1 frontend, múltiplos backends) e destravar a visibilidade do projeto no portfólio — não é o objetivo final do benchmark em si.
- Laravel continua adiado até o frontend estar funcional com NestJS + Spring Boot.
