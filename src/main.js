// Ponto de entrada: decide entre tela de login, modo sem conta e app sincronizado com o Drive.
import { GOOGLE_CLIENT_ID, DATA_FILE } from "./config.js";
import * as auth from "./auth.js";
import { SyncStore, LocalStore } from "./storage.js";
import { startApp, applyRemoteState, setStatus, getState } from "./app.js";

const SESSION_KEY = "profoco:session";      // { sub, email, name, picture }
const MODE_KEY = "profoco:mode";            // "google" | "local"
const LEGACY_KEYS = ["proximo-passo-v2", "proximo-passo-v1"];

const $ = (s) => document.querySelector(s);
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const configured = () => !!GOOGLE_CLIENT_ID;

function legacyState() {
  for (const k of LEGACY_KEYS) { const s = read(k); if (s) return s; }
  return null;
}

const G_LOGO = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

function showLogin(message) {
  document.body.classList.add("signed-out");
  $("#app").innerHTML =
    '<section class="login" aria-labelledby="login-title">' +
      '<img src="icons/icon.svg" alt="" width="72" height="72">' +
      '<h1 id="login-title">ProFoco</h1>' +
      '<p class="login-lead">Planeje o dia, comece pequeno e acompanhe sua evolução. Baseado em pesquisas sobre procrastinação.</p>' +
      (configured()
        ? '<button class="gbtn" id="login-google">' + G_LOGO + '<span>Entrar com Google</span></button>' +
          '<ol class="login-steps">' +
            '<li>Escolha sua conta Gmail.</li>' +
            '<li>Deixe marcada a caixa do <b>Google Drive</b> (é onde seus dados ficam guardados).</li>' +
            '<li>Toque em <b>Continuar</b>. Só isso.</li>' +
          '</ol>' +
          '<p class="hint">Seus dados ficam num arquivo privado no seu Google Drive. O ProFoco não tem servidor e não vê seus outros arquivos.</p>'
        : '<div class="banner"><b>Login com Google ainda não configurado.</b> Coloque o ID do cliente OAuth em <code>src/config.js</code> (passo a passo no README).</div>') +
      (message ? '<p class="login-error" role="alert">' + esc(message) + "</p>" : "") +
      '<button class="btn ghost" id="login-local">Usar sem conta neste aparelho</button>' +
      '<p class="hint"><a href="privacidade.html">Política de Privacidade</a></p>' +
    "</section>";
  const g = $("#login-google");
  if (g) g.addEventListener("click", () => signIn());
  $("#login-local").addEventListener("click", () => { write(MODE_KEY, "local"); bootLocal(); });
}

let needConsent = false;

async function signIn() {
  const btn = $("#login-google"); if (btn) btn.disabled = true;
  try {
    // Depois que a pessoa desmarcou a caixa do Drive, o Google só pergunta de novo com prompt "consent".
    const tok = await auth.requestToken({ prompt: needConsent ? "consent select_account" : "select_account" });
    const user = await auth.fetchUser(tok.access_token);
    write(SESSION_KEY, user); write(MODE_KEY, "google");
    needConsent = false;
    bootGoogle(user);
  } catch (e) {
    if (e.code === "drive_scope") needConsent = true;
    showLogin(auth.friendlyError(e));
  }
}

async function reauth(user) {
  try {
    await auth.requestToken({ prompt: "", hint: user.email });
    if (window.__profocoStore) window.__profocoStore.syncNow();
  } catch (e) {
    setStatus("reauth", auth.friendlyError(e));
  }
}

function signOut() {
  auth.clearToken();
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(MODE_KEY);
  location.hash = "";
  location.reload();
}

function bootGoogle(user) {
  document.body.classList.remove("signed-out");
  const store = new SyncStore({
    userKey: user.sub,
    fileName: DATA_FILE,
    getToken: auth.getToken,
    onStatus: setStatus,
    onRemote: applyRemoteState,
  });
  window.__profocoStore = store;
  let local = store.loadLocal();
  if (!local) { local = legacyState(); }
  startApp({
    store, user, initialState: local,
    onSignOut: signOut,
    onSignIn: () => {},
    onReauth: () => reauth(user),
  });
  store.start(getState());
  store.watch();
}

function bootLocal() {
  document.body.classList.remove("signed-out");
  const store = new LocalStore({ onStatus: setStatus });
  window.__profocoStore = store;
  startApp({
    store, user: null, initialState: store.loadLocal() || legacyState(),
    onSignOut: () => {},
    onSignIn: () => { localStorage.removeItem(MODE_KEY); showLogin(); if (!auth.isReady() && configured()) auth.initAuth(GOOGLE_CLIENT_ID).catch((e) => showLogin(e.message)); },
    onReauth: () => {},
  });
  setStatus("local");
}

async function main() {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  const mode = read(MODE_KEY), session = read(SESSION_KEY);
  if (mode === "local") return bootLocal();
  if (configured()) {
    try { await auth.initAuth(GOOGLE_CLIENT_ID); }
    catch (e) { if (!session) return showLogin(e.message); }
  }
  if (mode === "google" && session) return bootGoogle(session);
  showLogin();
}

main();
