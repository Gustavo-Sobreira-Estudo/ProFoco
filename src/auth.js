// Login com Google usando o "token model" do Google Identity Services (GIS).
// Sem servidor: o navegador recebe um access token (vale ~1 hora, sem refresh token).
// Quando expira, o usuário toca em "Reconectar" (o Google exige um gesto do usuário).
import { SCOPES } from "./config.js";

const TOKEN_KEY = "profoco:token";
const DRIVE_SCOPE = SCOPES[SCOPES.length - 1];
let client = null;

function waitForGis(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function check() {
      if (window.google && google.accounts && google.accounts.oauth2) return resolve();
      if (Date.now() - t0 > timeoutMs) return reject(new Error("Não foi possível carregar o login do Google. Verifique a internet."));
      setTimeout(check, 100);
    })();
  });
}

/** Prepara o cliente de token. Chame no carregamento, antes de qualquer clique em "Entrar". */
export async function initAuth(clientId) {
  await waitForGis();
  client = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES.join(" "),
    callback: () => {},
  });
}

export function isReady() { return !!client; }

/**
 * Abre o fluxo do Google e devolve { access_token, expires_at }.
 * Precisa ser chamado dentro de um clique (o navegador bloqueia pop-ups fora de gestos).
 */
export function requestToken({ prompt = "", hint } = {}) {
  if (!client) return Promise.reject(new Error("Login do Google ainda não carregou."));
  return new Promise((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error) return reject(Object.assign(new Error(resp.error_description || resp.error), { code: resp.error }));
      if (!google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
        return reject(Object.assign(new Error("Sem permissão no Drive, o ProFoco não consegue salvar seus dados."), { code: "drive_scope" }));
      }
      const tok = { access_token: resp.access_token, expires_at: Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60000 };
      try { localStorage.setItem(TOKEN_KEY, JSON.stringify(tok)); } catch (e) { /* modo privado */ }
      resolve(tok);
    };
    client.error_callback = (err) => reject(Object.assign(new Error(err && err.message ? err.message : "Login cancelado."), { code: err && err.type }));
    const cfg = { prompt };
    if (hint) cfg.login_hint = hint;
    client.requestAccessToken(cfg);
  });
}

/** Traduz erros do Google em mensagens que uma pessoa comum entende e sabe resolver. */
export function friendlyError(e) {
  const code = e && e.code;
  if (code === "popup_closed" || code === "access_denied") return "Login cancelado. Para usar o ProFoco, escolha sua conta e toque em Continuar na janela do Google.";
  if (code === "popup_failed_to_open") return "O navegador bloqueou a janela do Google. Permita pop-ups para este site e toque em Entrar de novo.";
  if (code === "drive_scope") return "Faltou marcar a permissão do Google Drive. Toque em Entrar e deixe a caixa do Drive marcada: é nela que seus dados ficam guardados.";
  return (e && e.message) || "Não foi possível entrar. Tente de novo.";
}

/** Token ainda válido ou null. */
export function getToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
    return t && t.expires_at > Date.now() ? t.access_token : null;
  } catch (e) { return null; }
}

export async function fetchUser(token) {
  const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("Não foi possível ler seu perfil do Google (" + r.status + ").");
  const u = await r.json();
  return { sub: u.sub, email: u.email, name: u.name || u.given_name || "", picture: u.picture || "" };
}

/** Sai deste aparelho (não revoga o acesso ao Drive: a próxima entrada é mais rápida). */
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
}
