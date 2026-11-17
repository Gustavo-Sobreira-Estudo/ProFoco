# ProFoco — guia para o Claude Code

App web (PWA) contra a procrastinação, para um mestrando que precisa terminar a dissertação. Cada recurso vem de pesquisa científica (veja "Base científica"). Interface em **português do Brasil**.

## Arquitetura em uma frase
HTML + CSS + JavaScript puro (módulos ES, **sem build, sem dependências**). Login com Google pelo Google Identity Services (token model) e dados num único arquivo JSON na **appDataFolder** do Google Drive de cada usuário. Não existe servidor.

## Comandos
- `npm run dev` → servidor local em http://localhost:5173 (usa `python3 -m http.server`; alternativa: `npm run dev:node`).
- `npm test` → testes da sincronização (`node --test`, Drive simulado, sem rede).
- Não abra `index.html` direto do disco (`file://`): módulos ES e o login do Google não funcionam assim.

## Mapa de arquivos
| Arquivo | Papel |
| --- | --- |
| `index.html` | Casca: cabeçalho, abas, `<main id="app">`, carrega GIS e `src/main.js` |
| `src/config.js` | `GOOGLE_CLIENT_ID`, nome do arquivo no Drive, escopos |
| `src/main.js` | Boot: tela de login, modo sem conta, cria o store e chama `startApp` |
| `src/auth.js` | GIS token client: `initAuth`, `requestToken`, `getToken`, `fetchUser` |
| `src/drive.js` | REST do Drive v3: `findFile`, `download`, `createFile`, `updateFile` |
| `src/storage.js` | `SyncStore` (cache local + Drive) e `LocalStore` (só aparelho); `decide()` |
| `src/app.js` | Toda a UI e regras: estado, telas, eventos (≈1100 linhas, seções marcadas com `/* ---------- NOME ---------- */`) |
| `src/styles.css` | Tokens no `:root` e estilos; tema claro pastel único |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA instalável e uso offline |
| `tests/storage.test.mjs` | Testes da sincronização |
| `deploy/github-pages.yml` | Workflow de deploy; copie para `.github/workflows/deploy.yml` |

## Como a UI funciona (`src/app.js`)
- **Estado único** `state` (JSON). Formato: `settings`, `habits[]`, `goals{nodes,roots}`, `days{YYYY-MM-DD:{locked,items[]}}`, `log{YYYY-MM-DD:{s,g,h,f}}`, `plans[]`, `reviews{}`, `updatedAt`, `v:2`. Mudanças de formato passam por `migrate()`.
- **Estado de interface** `ui` (aba atual, timer, menus abertos). Não é salvo.
- **Render**: cada tela é uma função `vNome()` que devolve HTML em string; `render()` troca o conteúdo de `#app`. Sempre use `esc()` em texto do usuário.
- **Eventos por delegação**: botões têm `data-act="..."` (tratados no `switch` do listener de `click`); campos têm `data-field="..."` (listeners de `input`/`change`). Para uma ação nova, adicione o `data-act` no HTML e um `case` no switch.
- **Salvar**: depois de mudar `state`, chame `save()` (atualiza `updatedAt` e entrega ao store). Não chame `render()` dentro de listeners de `input` (perde o foco do campo).
- Abas: `hoje`, `objetivos`, `semana` (inclui a revisão semanal), `perfil`, `seentao`, `ajustes`. Rotas por `#hash`; `ALIAS` mantém links antigos.

## Sincronização (`src/storage.js`)
- Cada mudança grava no `localStorage` na hora (`profoco:data:<sub>`) e vai ao Drive após 1,5 s sem mudanças.
- `sync()`: baixa o arquivo, compara `updatedAt` com `decide()` e faz pull, push ou nada. **Vence o mais recente** (last-writer-wins por documento inteiro).
- Sincroniza também ao voltar para o app, ao reconectar a internet e a cada 2 min.
- Status exibidos: `synced`, `syncing`, `pending`, `offline`, `reauth`, `error`, `local`.

## Login (`src/auth.js`)
- Token model do GIS: access token de ~1 h, **sem refresh token**. Guardamos `{access_token, expires_at}` em `localStorage` para não pedir login a cada recarga.
- Quando expira, o status vira `reauth` e aparece o botão **Reconectar** (o Google exige gesto do usuário para abrir o pop-up). O app continua funcionando offline.
- Escopos: `openid email profile` + `drive.appdata` (não sensível: só a pasta oculta do próprio app).

## Regras do projeto
- **Evidência primeiro**: todo recurso novo de comportamento deve citar a pesquisa no bloco "Por que funciona assim?" da tela e, se for nova, em Ajustes › Base científica. Não inventar estatísticas; comparações usam o histórico do próprio usuário.
- **Sem servidor e sem custos**: não adicionar backend, banco ou serviços pagos. Dados só no Drive do usuário.
- **Sem dependências** de npm em runtime. Bibliotecas só se forem indispensáveis, via CDN com versão fixa.
- **Acessibilidade**: alvos de toque ≥ 40 px, foco visível, `aria-label` em botões só com ícone, nomes de cor em português.
- **Design**: use os tokens do `:root` (`--lilac`, `--mint`, `--peach`, `--sky`, `--butter`, `--rose` e versões `-ink`). Tema claro pastel único.
- Ao mudar arquivos do app, aumente `CACHE` em `sw.js` para os usuários receberem a versão nova.
- Rode `npm test` antes de commitar.

## Base científica usada
Steel (2007) · Sirois e Pychyl (2013) · Boice (1989, 1997) · Gollwitzer e Sheeran (2006) · Bandura e Schunk (1981) · Lally et al. (2010) · Harkin et al. (2016) · Yang, Huang e Morwitz (2023) · Wohl, Pychyl e Bennett (2010) · Phillips et al. (2017).
