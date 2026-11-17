# ProFoco

App contra a procrastinação, baseado em pesquisas: tarefas do dia, pomodoro por tarefa, objetivos em árvore, hábitos, planos se–então, revisão semanal e perfil de evolução.

- **Login com Google.**
- **Dados no Google Drive do próprio usuário**, num arquivo privado (`profoco-data.json`) dentro da pasta oculta do app. Funciona no computador, tablet e celular com os mesmos dados.
- **Sem servidor e sem custo**: o app é só HTML, CSS e JavaScript. Pode ser hospedado de graça no GitHub Pages. O uso da API do Google Drive não é cobrado.
- **Instalável** (PWA) e funciona offline; sincroniza quando a internet volta.

## Rodar no seu computador

```bash
cd ~/Projetos/ProFoco
npm run dev        # abre em http://localhost:5173
npm test           # testes da sincronização
```

Sem configurar o Google, use "Usar sem conta neste aparelho" na tela inicial.

## Configurar o login com Google (uma vez, ~10 minutos)

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto chamado **ProFoco**.
2. Em **APIs e serviços › Biblioteca**, ative a **Google Drive API**.
3. Em **APIs e serviços › Tela de consentimento OAuth** (Google Auth Platform):
   - Tipo de usuário: **Externo**. Nome do app: **ProFoco**. Informe seu e-mail de suporte.
   - Em **Acesso a dados / Escopos**, adicione: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` e `.../auth/drive.appdata`. Todos são **não sensíveis**.
   - Em **Público-alvo**, **clique em "Publicar app"** (status "Em produção"). **Este passo é o que permite que qualquer pessoa com Gmail entre apenas dando permissão.** Como os escopos são não sensíveis, não precisa de verificação do Google nem de aviso "app não verificado". Enquanto ficar em **Teste**, só entram os e-mails cadastrados (até 100) e o acesso expira a cada 7 dias.
4. Em **Credenciais › Criar credenciais › ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**.
   - **Origens JavaScript autorizadas**: `http://localhost:5173` e, quando publicar, `https://SEU-USUARIO.github.io`.
   - Não precisa de URI de redirecionamento.
5. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e cole em `src/config.js`:
   ```js
   export const GOOGLE_CLIENT_ID = "123...apps.googleusercontent.com";
   ```
   Esse ID é público por natureza; não é uma senha.

## Publicar grátis no GitHub Pages

```bash
cd ~/Projetos/ProFoco
mkdir -p .github/workflows && cp deploy/github-pages.yml .github/workflows/deploy.yml
git init && git add . && git commit -m "ProFoco"
git branch -M main
git remote add origin git@github.com:SEU-USUARIO/ProFoco.git
git push -u origin main
```

No GitHub: **Settings › Pages › Source: GitHub Actions**. O workflow (copiado de `deploy/github-pages.yml` para `.github/workflows/deploy.yml` no primeiro comando acima) roda os testes e publica em `https://SEU-USUARIO.github.io/ProFoco/`. Lembre de adicionar `https://SEU-USUARIO.github.io` nas origens autorizadas (passo 4).

No tablet ou celular, abra o endereço e use **Adicionar à tela inicial** para instalar.

## Como os dados funcionam

- Cada alteração é salva na hora no aparelho e enviada ao Drive depois de 1,5 s.
- Ao abrir em outro aparelho, o ProFoco baixa o arquivo e usa a versão mais recente.
- O acesso do Google dura cerca de 1 hora. Quando vence, aparece o botão **Reconectar** no topo; até lá tudo continua salvo no aparelho.
- O app só enxerga a própria pasta oculta no Drive (escopo `drive.appdata`), nunca os outros arquivos do usuário.
- Ajustes › Conta e dados: sincronizar agora, sair, copiar e restaurar backup.

## Continuar desenvolvendo com o Claude Code

```bash
cd ~/Projetos/ProFoco
claude
```

O arquivo `CLAUDE.md` explica a arquitetura, as convenções e as regras do projeto para o Claude Code.
