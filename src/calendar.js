// Google Agenda (somente leitura): mostra em "Hoje" os eventos do dia.
// Usa um token separado do login/Drive (escopo próprio), pedido só quando a pessoa conecta em Ajustes.
import { GOOGLE_CLIENT_ID } from "./config.js";
import { waitForGis } from "./auth.js";

export const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const TOKEN_KEY = "profoco:caltoken";
const CACHE_KEY = "profoco:calcache";
const API = "https://www.googleapis.com/calendar/v3";
let client = null;

/** Prepara o cliente do Google. Chame antes do clique em "Conectar" (o pop-up só abre dentro de um clique). */
export async function prepare() {
  if (client || !GOOGLE_CLIENT_ID) return;
  await waitForGis();
  client = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: CAL_SCOPE,
    include_granted_scopes: false, // token só da agenda, separado do Drive
    callback: () => {},
  });
}

export function connect({ hint, prompt = "" } = {}) {
  if (!client) return Promise.reject(Object.assign(new Error("A agenda ainda está carregando. Tente de novo em instantes."), { code: "not_ready" }));
  return new Promise((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error) return reject(Object.assign(new Error(resp.error_description || resp.error), { code: resp.error }));
      if (!google.accounts.oauth2.hasGrantedAllScopes(resp, CAL_SCOPE)) {
        return reject(Object.assign(new Error("cal_scope"), { code: "cal_scope" }));
      }
      const tok = { access_token: resp.access_token, expires_at: Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60000 };
      try { localStorage.setItem(TOKEN_KEY, JSON.stringify(tok)); } catch (e) { /* modo privado */ }
      resolve(tok);
    };
    client.error_callback = (err) => reject(Object.assign(new Error((err && err.message) || "Login cancelado."), { code: err && err.type }));
    const cfg = { prompt };
    if (hint) cfg.login_hint = hint;
    client.requestAccessToken(cfg);
  });
}

export function getToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
    return t && t.expires_at > Date.now() ? t.access_token : null;
  } catch (e) { return null; }
}

/** Esquece o acesso neste aparelho (não revoga a permissão no Google: isso se faz em myaccount.google.com/permissions). */
export function disconnect() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
}

export function loadCache(day) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return c && c.day === day && Array.isArray(c.events) ? c.events : [];
  } catch (e) { return []; }
}
export function saveCache(day, events) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ day, events, at: Date.now() })); } catch (e) { /* ignore */ }
}

export function friendlyError(e) {
  const code = e && e.code;
  if (code === "popup_closed" || code === "access_denied") return "Conexão cancelada. Para ver a agenda, escolha a conta e toque em Continuar.";
  if (code === "popup_failed_to_open") return "O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente de novo.";
  if (code === "cal_scope") return "Faltou marcar a permissão de ver a agenda. Toque em Conectar de novo e deixe a caixa da Agenda marcada.";
  return (e && e.message) || "Não foi possível conectar a agenda.";
}

const str = (v) => (typeof v === "string" ? v : "");
/**
 * Junta os eventos de várias agendas em uma lista do dia: sem duplicados, sem cancelados,
 * sem os que a própria pessoa recusou. Dia inteiro primeiro, depois por horário.
 * @param {Array<Array<object>>} lists  itens "events" da API, um array por agenda
 */
export function normalizeEvents(lists) {
  const seen = new Set(), out = [];
  for (const items of lists) {
    for (const ev of items || []) {
      if (!ev || ev.status === "cancelled") continue;
      if (ev.eventType === "workingLocation") continue;
      if ((ev.attendees || []).some((a) => a.self && a.responseStatus === "declined")) continue;
      const s = ev.start || {}, allDay = !!s.date && !s.dateTime;
      const start = allDay ? null : Date.parse(s.dateTime), end = allDay ? null : Date.parse((ev.end || {}).dateTime);
      if (!allDay && !isFinite(start)) continue;
      const key = (ev.id || "") + "|" + (s.dateTime || s.date);
      if (seen.has(key)) continue; seen.add(key);
      const link = str(ev.htmlLink).startsWith("https://") ? ev.htmlLink : "";
      out.push({ id: ev.id || key, title: ev.summary || "(Sem título)", allDay, start, end: isFinite(end) ? end : start, place: ev.location || "", link, meet: str(ev.hangoutLink).startsWith("https://") ? ev.hangoutLink : "" });
    }
  }
  return out.sort((a, b) => (a.allDay === b.allDay ? (a.allDay ? a.title.localeCompare(b.title) : a.start - b.start) : (a.allDay ? -1 : 1)));
}

/** Busca os eventos de hoje (do fuso do aparelho) nas agendas selecionadas, até 8. */
export async function fetchToday(token, { now = new Date(), fetchImpl = fetch } = {}) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()), end = new Date(start); end.setDate(end.getDate() + 1);
  const headers = { Authorization: "Bearer " + token };
  const get = async (url) => {
    const r = await fetchImpl(url, { headers });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error("Acesso à agenda expirou."), { code: "auth" });
    if (!r.ok) throw Object.assign(new Error("Não foi possível ler a agenda (" + r.status + ")."), { code: "http" });
    return r.json();
  };
  const cl = await get(API + "/users/me/calendarList?minAccessRole=reader&maxResults=50&fields=items(id,selected,primary)");
  const cals = (cl.items || []).filter((c) => c.selected || c.primary).slice(0, 8);
  const q = "?singleEvents=true&orderBy=startTime&maxResults=25&timeMin=" + encodeURIComponent(start.toISOString()) + "&timeMax=" + encodeURIComponent(end.toISOString()) +
    "&fields=items(id,summary,status,eventType,start,end,htmlLink,hangoutLink,location,attendees(self,responseStatus))";
  const lists = await Promise.all(cals.map((c) => get(API + "/calendars/" + encodeURIComponent(c.id) + "/events" + q).then((d) => d.items || [])));
  return normalizeEvents(lists);
}
