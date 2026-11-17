// ProFoco — UI e lógica do app (módulo ES).
// Renderização por templates de string + delegação de eventos (data-act / data-field).
// Persistência é injetada por main.js via startApp({ store, ... }).
import { PIX_KEY } from "./config.js";
import * as cal from "./calendar.js";

/* ---------- helpers ---------- */
const $ = (s, el) => (el || document).querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, "0");
const dayKey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parseDay = k => { const p = k.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
const isWeekday = d => d.getDay() >= 1 && d.getDay() <= 5;
const DOW = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
const DOW1 = ["S", "T", "Q", "Q", "S", "S", "D"];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const fmtLong = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = d => pad(d.getDate()) + "/" + pad(d.getMonth() + 1);
const fmtTime = ts => { const d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const todayKey = () => dayKey(new Date());
const COLORS = ["sky", "mint", "peach", "rose", "butter", "lilac"];
const COLOR_NAMES = { sky: "Azul", mint: "Verde", peach: "Pêssego", rose: "Rosa", butter: "Amarelo", lilac: "Lilás" };
const plural = (n, s, p) => n + " " + (n === 1 ? s : (p || s + "s"));

/* ---------- agenda (Google Agenda, só leitura) ---------- */
function agendaInner() {
  if (!state.settings.calendar) return "";
  const c = ui.cal, now = Date.now(), ev = c.events;
  const reconnect = '<div class="row"><button class="btn small" data-act="calconnect">' + (ev.length ? "Atualizar agenda" : "Reconectar agenda") + "</button></div>";
  if (!ev.length) {
    return c.status === "needauth" ? '<div class="panel agenda"><div class="panel-head"><h2>Agenda de hoje</h2></div><p class="hint">Reconecte a agenda para ver seus eventos de hoje neste aparelho.</p>' + reconnect + "</div>" : "";
  }
  const rows = ev.map(e => {
    const live = !e.allDay && e.start <= now && now < e.end, past = !e.allDay && e.end <= now;
    const when = e.allDay ? "Dia todo" : fmtTime(e.start) + "–" + fmtTime(e.end);
    const title = e.link ? '<a href="' + esc(e.link) + '" target="_blank" rel="noopener noreferrer">' + esc(e.title) + "</a>" : esc(e.title);
    return '<li class="agrow' + (past ? " past" : "") + (live ? " live" : "") + '"><span class="agtime">' + when + '</span><div class="agmain"><span class="t">' + title + "</span>" +
      (e.place ? '<span class="tm">' + esc(e.place) + "</span>" : "") + "</div>" +
      (live ? '<span class="chip sky">agora</span>' : "") + (e.meet && !past ? '<a class="chip" href="' + esc(e.meet) + '" target="_blank" rel="noopener noreferrer">Entrar</a>' : "") + "</li>";
  }).join("");
  return '<div class="panel agenda"><div class="panel-head"><h2>Agenda de hoje</h2><span class="chip sky">' + plural(ev.length, "evento") + "</span></div>" +
    '<ul class="aglist">' + rows + "</ul>" + (c.status === "needauth" ? '<p class="hint">Mostrando a última leitura. A permissão deste aparelho expirou.</p>' + reconnect : "") + "</div>";
}
/* O painel mora num contêiner fixo: atualiza só ele, sem redesenhar a tela (não tira o foco de quem digita). */
function agendaHTML() { const h = agendaInner(); return '<div id="agenda"' + (h ? "" : " hidden") + ">" + h + "</div>"; }
function paintAgenda() { const el = $("#agenda"); if (!el) return; const h = agendaInner(); el.innerHTML = h; el.hidden = !h; }
async function refreshAgenda() {
  if (!state || !state.settings.calendar) return;
  const day = todayKey();
  if (ui.cal.day !== day) { ui.cal.day = day; ui.cal.events = cal.loadCache(day); }
  const tok = cal.getToken();
  if (!tok) { ui.cal.status = "needauth"; paintAgenda(); return; }
  try {
    ui.cal.events = await cal.fetchToday(tok); ui.cal.status = "ok"; cal.saveCache(day, ui.cal.events);
  } catch (e) {
    if (e.code === "auth") { cal.disconnect(); ui.cal.status = "needauth"; } else ui.cal.status = "error";
  }
  paintAgenda(); if (ui.view === "ajustes") { const l = $("#cal-line"); if (l) l.textContent = calLine(); }
}
function calLine() {
  const S = state.settings, c = ui.cal;
  if (!S.calendar) return "Desconectada.";
  if (c.status === "needauth") return "Conectada, mas a permissão deste aparelho expirou. Toque em Reconectar.";
  if (c.status === "error") return "Conectada, mas não consegui ler a agenda agora.";
  return "Conectada. " + (c.events.length ? plural(c.events.length, "evento") + " hoje." : "Nenhum evento hoje.");
}
function calendarPanel() {
  const S = state.settings, on = !!S.calendar, expired = on && ui.cal.status === "needauth";
  return '<div class="panel"><h2>Google Agenda</h2><p class="hint">Mostra em Hoje os eventos do dia das suas agendas. É só leitura: o ProFoco não cria, altera nem apaga eventos, e os eventos não são salvos no Drive.</p>' +
    '<p class="sync-line"><span class="dot"></span><span id="cal-line">' + esc(calLine()) + "</span></p>" +
    '<div class="row">' + (on ? (expired ? '<button class="btn primary" data-act="calconnect">Reconectar</button>' : '<button class="btn" data-act="calrefresh">Atualizar agora</button>') + '<button class="btn ghost danger" data-act="caloff">Desconectar</button>' : '<button class="btn primary" data-act="calconnect">Conectar Google Agenda</button>') + "</div></div>";
}

/* ---------- apoio voluntário (Pix) ---------- */
const SUPPORT_VIEWS = ["objetivos", "semana", "perfil", "seentao"];
/** Linha discreta no fim das abas secundárias. Sem chave Pix configurada, não aparece. */
function supportLine() {
  if (!PIX_KEY) return "";
  return '<p class="support">ProFoco é gratuito e sem anúncios. Se ele ajuda você, <button class="linkbtn" data-act="copypix">copie a chave Pix</button> e apoie com qualquer valor.</p>';
}
function supportPanel() {
  if (!PIX_KEY) return "";
  return '<div class="panel"><h2>Apoie o ProFoco</h2><p class="hint">O ProFoco é gratuito, não tem anúncios e não rastreia você. Se ele ajuda nos seus estudos, você pode apoiar o projeto com um Pix de qualquer valor. É totalmente opcional.</p>' +
    '<div class="row"><code class="pixkey">' + esc(PIX_KEY) + '</code><button class="btn primary" data-act="copypix">Copiar chave Pix</button></div></div>';
}

/* ---------- state ---------- */
const PCATS = ["Começar", "Distração", "Travar", "Emoção", "Rotina", "Outro"];
const PCAT_COLOR = { "Começar": "sky", "Distração": "peach", "Travar": "butter", "Emoção": "rose", "Rotina": "mint", "Outro": "lilac" };
function mkPlan(a, b, cat) { return { id: uid(), a: a || "", b: b || "", cat: cat || "Outro", pinned: true, active: true, uses: 0, last: null, created: Date.now() }; }
function fixPlan(p) {
  if (!p || typeof p !== "object") return null;
  return Object.assign({ cat: "Outro", pinned: true, active: true, uses: 0, last: null, created: Date.now() }, p, { id: p.id || uid() });
}
function defaults() {
  return {
    v: 2, updatedAt: 0, createdDay: todayKey(),
    settings: { wake: "08:00", goal: 2, min: 1, focus: 25, brk: 5, long: 15, theme: "auto", accent: "lilac", calendar: false },
    habits: [
      { id: "wake", name: "Acordar no horário", kind: "check", per: "day", n: 1, color: "sky", wake: true },
      { id: "ex", name: "Exercício", kind: "check", per: "week", n: 3, color: "mint" },
      { id: "read", name: "Leitura", kind: "count", unit: "páginas", per: "day", n: 10, color: "peach" }
    ],
    goals: { nodes: {}, roots: [] },
    days: {},
    plans: [],
    log: {}, reviews: {}
  };
}
function migrate(s) {
  const d = defaults();
  if (!s || typeof s !== "object") return d;
  if (s.v === 1) {
    const n = d;
    n.createdDay = s.createdDay || n.createdDay;
    n.updatedAt = s.updatedAt || 0;
    if (s.settings) ["wake", "goal", "min", "focus", "brk"].forEach(k => { if (s.settings[k] != null) n.settings[k] = s.settings[k]; });
    if (Array.isArray(s.plans)) n.plans = s.plans.map(fixPlan).filter(Boolean);
    if (s.reviews) n.reviews = s.reviews;
    Object.keys(s.log || {}).forEach(k => { const l = s.log[k] || {}; n.log[k] = { s: l.s || 0, g: l.g, f: l.f, h: { wake: !!l.w, ex: !!l.e, read: Number(l.p) || 0 } }; });
    const open = (s.tasks || []).filter(t => !t.done && !t.ex);
    if (open.length) n.days[todayKey()] = { locked: false, items: open.map(t => ({ id: uid(), title: t.title, done: false })) };
    return n;
  }
  s.settings = Object.assign({}, d.settings, s.settings || {});
  if (!Array.isArray(s.habits)) s.habits = d.habits;
  if (!s.goals || !s.goals.nodes || !Array.isArray(s.goals.roots)) s.goals = { nodes: {}, roots: [] };
  s.plans = Array.isArray(s.plans) ? s.plans.map(fixPlan).filter(Boolean) : d.plans;
  ["days", "log", "reviews"].forEach(k => { if (!s[k] || typeof s[k] !== "object") s[k] = {}; });
  if (!s.createdDay) s.createdDay = todayKey();
  if (typeof s.updatedAt !== "number") s.updatedAt = 0;
  s.goals.roots.forEach((r, i) => { const n = s.goals.nodes[r]; if (n && !n.color) n.color = COLORS[i % COLORS.length]; });
  Object.values(s.days).forEach(p => (p.items || []).forEach(it => { if (!it.rc) it.rc = COLORS[Math.abs([...it.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0) | 0, 7)) % COLORS.length]; }));
  s.v = 2;
  return s;
}
let state = null;
let ctx = { store: null, user: null };
const ui = { syncStatus: "", syncDetail: "", view: "hoje", step: null, feel: [], swap: false, weekOff: 0, revOff: 0, wipe: false, afterDone: null, timer: null, restoreOpen: false, sel: null, edit: null, divide: null, confirmDel: null, newPlanNode: "", newColor: "", lockConfirm: false, extraOpen: false, pMenu: null, daysOpen: false, lastTask: null, branch: null, pEdit: null, pDel: null, pFilter: "Todas" };
ui.cal = { events: [], status: "idle", day: null };

/* ---------- persistence (injetada) ---------- */
const STATUS_TEXT = { synced: "Salvo no Drive", syncing: "Salvando no Drive…", pending: "Alterações a salvar", offline: "Sem internet: salvo neste aparelho", reauth: "Reconecte para salvar no Drive", error: "Erro ao salvar no Drive", local: "Salvo só neste aparelho" };
export function setStatus(s, detail) {
  ui.syncStatus = s; ui.syncDetail = detail || "";
  const el = $("#status"); if (!el) return;
  const txt = STATUS_TEXT[s] || "";
  el.dataset.s = s; el.title = txt + (detail ? " · " + detail : "");
  const t = $("#status-t"); if (t) t.textContent = txt;
  const rb = $("#reauth-btn"); if (rb) rb.hidden = s !== "reauth";
  if (ui.view === "ajustes" && document.activeElement && document.activeElement.tagName !== "INPUT") { const sp = $("#sync-line"); if (sp) sp.textContent = syncLine(); }
}
function syncLine() { return (STATUS_TEXT[ui.syncStatus] || "") + (ui.syncDetail ? " · " + ui.syncDetail : ""); }
function save() {
  state.updatedAt = Date.now();
  if (ctx.store) ctx.store.save(clone(state));
}
/** Substitui o estado pelo que veio do Drive (outro aparelho salvou depois). */
export function applyRemoteState(remote) {
  state = migrate(clone(remote));
  applyTheme();
  render();
  if (state.settings.calendar) refreshAgenda();
}
const THEME_NAMES = { auto: "Automático", light: "Claro", dark: "Escuro" };
const ACCENTS = ["lilac", "sky", "mint", "peach", "rose"];
/** Aplica tema (claro/escuro/automático) e cor de destaque, e guarda uma cópia local para a próxima abertura. */
function applyTheme() {
  const S = state ? state.settings : {};
  const theme = THEME_NAMES[S.theme] ? S.theme : "auto", accent = ACCENTS.includes(S.accent) ? S.accent : "lilac";
  const r = document.documentElement; r.dataset.theme = theme; r.dataset.accent = accent;
  try { localStorage.setItem("profoco:theme", JSON.stringify({ theme, accent })); } catch (e) {}
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = getComputedStyle(r).getPropertyValue("--paper").trim() || "#f6f4fb";
}
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (state) applyTheme(); }); } catch (e) {}
export function getState() { return state ? clone(state) : null; }

/* ---------- days, log, habits ---------- */
const L = k => state.log[k] || {};
function logDay(k) { if (!state.log[k]) state.log[k] = { s: 0 }; if (!state.log[k].h) state.log[k].h = {}; return state.log[k]; }
const peekPlan = k => state.days[k] || { locked: false, items: [] };
function dayPlan(k) { if (!state.days[k]) state.days[k] = { locked: false, items: [] }; return state.days[k]; }
const goalOf = k => L(k).g || state.settings.goal;
function sortedItems(p) {
  const tid = ui.timer && ui.timer.phase === "focus" ? ui.timer.taskId : null;
  const rank = it => it.done ? 3 : (it.paused ? 2 : 1);
  return p.items.map((it, i) => ({ it, i })).sort((a, b) => {
    const ra = rank(a.it), rb = rank(b.it); if (ra !== rb) return ra - rb;
    if (ra === 3) return (a.it.doneAt || 0) - (b.it.doneAt || 0);
    if (ra === 2) return (a.it.pausedAt || 0) - (b.it.pausedAt || 0);
    return a.i - b.i;
  }).map(x => x.it);
}
function nextItem() {
  const p = peekPlan(todayKey());
  const n = p.items.find(i => i.id === p.next && !i.done && !i.paused);
  return n || sortedItems(p).find(i => !i.done) || null;
}
function itemById(id) { return id ? (peekPlan(todayKey()).items.find(i => i.id === id) || null) : null; }
function timerItem() { return ui.timer ? itemById(ui.timer.taskId) : null; }
function rootColorOf(nid) { const r = nid && node(nid) ? rootOf(nid) : null; return r && r.color ? r.color : null; }
function taskColor(it) { return it.color || rootColorOf(it.node) || it.rc || "lilac"; }
const randColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
const hv = (k, h) => { const l = L(k); return l.h ? l.h[h.id] : undefined; };
function hDone(k, h) {
  const v = hv(k, h);
  if (h.kind === "count") return h.per === "day" ? (Number(v) || 0) >= (h.n || 1) : (Number(v) || 0) > 0;
  return !!v;
}
function focusDone(k) { return (L(k).s || 0) >= state.settings.min; }
function weekCount(mon, h) { let c = 0; for (let i = 0; i < 7; i++) if (hDone(dayKey(addDays(mon, i)), h)) c++; return c; }
function dailyStreak(test, opts) {
  const today = new Date(), skipWe = opts && opts.skipWeekend;
  let d = today;
  if (!test(dayKey(d)) || (skipWe && !isWeekday(d))) d = addDays(d, -1);
  let n = 0, guard = 0;
  while (guard++ < 800) {
    if (skipWe && !isWeekday(d)) { d = addDays(d, -1); continue; }
    if (dayKey(d) < state.createdDay && !test(dayKey(d))) break;
    if (!test(dayKey(d))) break;
    n++; d = addDays(d, -1);
  }
  return n;
}
function bestDaily(test, skipWe) {
  let best = 0, cur = 0;
  const start = parseDay(state.createdDay < earliestLog() ? state.createdDay : earliestLog());
  for (let d = start; d <= new Date(); d = addDays(d, 1)) {
    if (skipWe && !isWeekday(d)) continue;
    if (test(dayKey(d))) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return best;
}
function earliestLog() { const ks = Object.keys(state.log).sort(); return ks[0] || state.createdDay; }
function weeklyStreak(h) {
  let mon = mondayOf(new Date()), n = 0, guard = 0;
  if (weekCount(mon, h) < h.n) mon = addDays(mon, -7);
  while (guard++ < 200 && weekCount(mon, h) >= h.n) { n++; mon = addDays(mon, -7); }
  return n;
}
function prevWorkday(d) { let x = addDays(d, -1); while (!isWeekday(x)) x = addDays(x, -1); return x; }

/* ---------- goals tree ---------- */
const G = () => state.goals;
const node = id => G().nodes[id];
const isLeaf = n => !n.children || !n.children.length;
function nodeDone(id) { const n = node(id); return !!(n && n.done); }
function subtree(id) { const n = node(id); if (!n) return []; return [id].concat((n.children || []).flatMap(subtree)); }
function undoneNodes() { return G().roots.flatMap(subtree).filter(id => !node(id).done); }
function leavesOf(id) { const n = node(id); if (!n) return []; return isLeaf(n) ? [id] : n.children.flatMap(leavesOf); }
function rootOf(id) { let n = node(id); while (n && n.parent) n = node(n.parent); return n; }
function openLeaves() { return undoneNodes().filter(id => (node(id).children || []).every(c => node(c) && node(c).done) && node(id).parent); }
function delSubtree(id) {
  const n = node(id); if (!n) return;
  (n.children || []).slice().forEach(delSubtree);
  if (n.parent) { const p = node(n.parent); if (p) p.children = p.children.filter(c => c !== id); }
  else G().roots = G().roots.filter(r => r !== id);
  delete G().nodes[id];
}
function addNode(title, parent) {
  const id = uid();
  G().nodes[id] = { id, title, parent: parent || null, children: [], done: false, doneAt: null };
  if (parent) node(parent).children.push(id);
  else { const used = G().roots.map(r => node(r) && node(r).color); G().nodes[id].color = COLORS.find(c => !used.includes(c)) || randColor(); G().roots.push(id); }
  return id;
}
function itemsForNode(id) { let c = 0; Object.values(state.days).forEach(p => p.items.forEach(i => { if (i.node === id && i.done) c++; })); return c; }

/* ---------- timer ---------- */
let audioCtx = null;
function beep() {
  try {
    if (audioCtx) {
      const now = audioCtx.currentTime;
      for (let i = 0; i < 3; i++) {
        const t0 = now + i * 0.42, o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = i === 2 ? 880 : 660;
        o.connect(g); g.connect(audioCtx.destination);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
        o.start(t0); o.stop(t0 + 0.4);
      }
    }
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]); } catch (e) {}
}
function primeAudio() { try { if (!audioCtx) { const A = window.AudioContext || window.webkitAudioContext; if (A) audioCtx = new A(); } if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); } catch (e) {} }
function abandonTimer() {
  const t = ui.timer; if (!t) return;
  if (t.phase === "focus" && t.total - timeLeft() >= t.total / 2) { const l = logDay(todayKey()); l.s = (l.s || 0) + 1; l.g = state.settings.goal; save(); toast("Sessão anterior registrada."); }
  ui.timer = null; ui.step = null; document.title = "ProFoco";
}
/** Descanso depois do pomodoro atual: a cada 4 pomodoros do dia, o descanso é o longo. */
function breakInfo() {
  const S = state.settings, n = L(todayKey()).s || 0, long = n > 0 && n % 4 === 0;
  return { long, min: long ? (S.long || 15) : S.brk };
}
function startTimer(phase, minutes, taskId, long) {
  const ms = minutes * 60000;
  ui.timer = { phase, total: ms, endAt: Date.now() + ms, left: ms, paused: false, taskId: taskId || null, long: !!long };
  ui.step = "running"; render();
}
function timeLeft() { const t = ui.timer; if (!t) return 0; return t.paused ? t.left : Math.max(0, t.endAt - Date.now()); }
function fmtMs(ms) { const s = Math.ceil(ms / 1000); return pad(Math.floor(s / 60)) + ":" + pad(s % 60); }
function finishTimer(early) {
  const t = ui.timer; if (!t) return;
  const elapsed = t.total - timeLeft();
  ui.timer = null; if (t.taskId) ui.lastTask = t.taskId;
  if (t.phase === "focus") {
    const counts = !early || elapsed >= t.total / 2;
    if (counts) { const l = logDay(todayKey()); l.s = (l.s || 0) + 1; l.g = state.settings.goal; save(); }
    if (!early) beep();
    toast(counts ? "Pomodoro registrado." : "Encerrada antes da metade: não contou. Tudo bem.");
    ui.step = "after"; ui.afterDone = null;
  } else {
    if (!early) { beep(); toast("Descanso terminado."); }
    ui.step = early ? null : "breakend";
  }
  document.title = "ProFoco";
  render(); updatePill();
}
setInterval(() => {
  const t = ui.timer; if (!t) return;
  const left = timeLeft();
  const d = $("#digits"); if (d) d.textContent = fmtMs(left);
  updatePill();
  const b = $("#bar>i"); if (b) b.style.width = (100 * (1 - left / t.total)).toFixed(2) + "%";
  document.title = fmtMs(left) + (t.phase === "focus" ? " · foco" : " · descanso") + " · ProFoco";
  if (!t.paused && left <= 0) finishTimer(false);
}, 250);

let toastT = null;
function toast(msg, label, fn) {
  const el = $("#toast"); el.innerHTML = "";
  const sp = document.createElement("span"); sp.textContent = msg; el.appendChild(sp);
  if (label && fn) { const b = document.createElement("button"); b.className = "toast-btn"; b.textContent = label; b.addEventListener("click", () => { fn(); el.classList.remove("on"); el.style.pointerEvents = "none"; }); el.appendChild(b); el.style.pointerEvents = "auto"; }
  else el.style.pointerEvents = "none";
  el.classList.add("on"); clearTimeout(toastT);
  toastT = setTimeout(() => { el.classList.remove("on"); el.style.pointerEvents = "none"; }, label ? 6500 : 3200);
}

/* ---------- shared bits ---------- */
function pips(done, goal, min) {
  let h = ""; const n = Math.max(goal, done);
  for (let i = 0; i < n; i++) h += '<span class="pip' + (i < done ? " on" : "") + (i < min ? " min" : "") + '"></span>';
  return '<div class="pips" aria-hidden="true">' + h + "</div>";
}
function cal28(test, color, big) {
  const today = new Date(), tk = dayKey(today), start = addDays(mondayOf(today), -21);
  let h = DOW1.map(x => '<span class="h">' + x + "</span>").join("");
  for (let i = 0; i < 28; i++) {
    const d = addDays(start, i), k = dayKey(d);
    const fut = k > tk, ok = !fut && test(k);
    h += '<span class="c' + (fut ? " fut" : "") + (k === tk ? " today" : "") + '" title="' + fmtShort(d) + (ok ? " · feito" : "") + '"' + (ok ? ' style="background:var(--' + color + ');border-color:var(--' + color + '-ink)"' : "") + "></span>";
  }
  return '<div class="cal' + (big ? " big" : "") + '" aria-label="Últimas 4 semanas">' + h + "</div>";
}
function nodeOptions(sel, forWhat) {
  const ol = undoneNodes();
  return '<div class="metarow"><label for="meta-' + forWhat + '">Meta</label><select id="meta-' + forWhat + '" data-field="plannode" data-for="' + forWhat + '"><option value="">Tarefa livre</option>' + ol.map(id => '<option value="' + id + '"' + (sel === id ? " selected" : "") + ">" + esc(node(id).title) + " · " + esc((rootOf(id) || {}).title || "") + "</option>").join("") + "</select></div>";
}
function metaChip(i) { return i.node && node(i.node) ? '<span class="chip butter">Meta: ' + esc(node(i.node).title) + "</span>" : ""; }
function metaText(i) { return i.node && node(i.node) ? esc(node(i.node).title) : ""; }

/* ---------- HOJE ---------- */
function allTasksDone(k) { const p = peekPlan(k); return p.items.length > 0 && p.items.every(i => i.done); }
function vHoje() {
  const now = new Date(), k = dayKey(now), l = L(k), S = state.settings, plan = peekPlan(k);
  const done = l.s || 0, tn = plan.items.length, td = plan.items.filter(i => i.done).length;
  let banner = "";
  const pk = dayKey(prevWorkday(now));
  if (allTasksDone(k)) banner = '<div class="banner mint"><b>Todas as tarefas do dia estão concluídas.</b> O resto do dia é seu.</div>';
  else if (tn > 0 && done === 0 && pk >= state.createdDay && (L(pk).s || 0) === 0 && Object.keys(state.log).some(x => x < k))
    banner = '<div class="banner"><b>Ontem não teve sessão.</b> Acontece, e um dia perdido não desfaz o hábito. Hoje vale a versão mínima: ' + plural(S.min, "pomodoro") + ".</div>";
  else if (done >= S.goal) banner = '<div class="banner mint"><b>Meta de pomodoros cumprida.</b> Se parar agora, a próxima largada fica mais fácil.</div>';
  const pinned = state.plans.filter(p => p.active && p.pinned);
  return '<section class="view">' +
    '<div class="head"><div><p class="eyebrow">' + esc(fmtLong.format(now)) + '</p><h1>Hoje</h1></div>' +
    '<p class="daysum"><b>' + td + "/" + tn + "</b> tarefas · <b>" + done + "/" + S.goal + "</b> pomodoros</p></div>" +
    focusCard() + planPanel(k) + agendaHTML() + banner +
    habitsPanel() +
    (pinned.length ? '<div class="panel"><div class="panel-head"><h2>Se–então em destaque</h2><button class="btn small ghost" data-act="nav" data-v="seentao">Ver todos</button></div><ul class="plans-list">' +
      pinned.map(p => '<li style="background:var(--' + (PCAT_COLOR[p.cat] || "sky") + ')"><span><b>' + esc(p.a) + ",</b> " + esc(p.b) + '.</span><button class="btn small" data-act="puse" data-id="' + p.id + '">Usei</button></li>').join("") +
    "</ul></div>" : "") +
    '<details class="why"><summary>Por que funciona assim?</summary><p><b>Por que listar as tarefas antes?</b> Decidir de antemão o que fazer aproxima a intenção da ação (Gollwitzer e Sheeran, 2006). <b>Por que o descanso longo?</b> Sessões curtas de foco com pausas regulares tornam o trabalho sustentável (Boice, 1989, 1997); a cada 4 pomodoros a pausa é mais longa. <b>Por que acompanhar sequências?</b> Registrar o progresso aumenta o alcance de metas (Harkin et al., 2016), e falhar um dia não interrompe a formação do hábito (Lally et al., 2010).</p></details>' +
    "</section>";
}
function suggestions(k) {
  const plan = peekPlan(k);
  const titles = new Set(plan.items.map(i => i.title.toLowerCase()));
  const ol = openLeaves().filter(id => !titles.has(node(id).title.toLowerCase())).slice(0, 8);
  let pend = [], pendDay = null;
  for (let i = 1; i <= 7 && !pendDay; i++) {
    const pk = dayKey(addDays(new Date(), -i)), pp = state.days[pk];
    if (pp && pp.items.length) { pendDay = pk; pend = pp.items.filter(x => !x.done && !x.moved && !titles.has(x.title.toLowerCase())); }
  }
  return (ol.length || pend.length ? '<div class="sugg">' +
    (pend.length ? '<div><p class="hint">Pendentes de ' + DOW[(parseDay(pendDay).getDay() + 6) % 7].toLowerCase() + ':</p><div class="row">' + pend.map(x => '<button class="chip peach" data-act="planaddpend" data-day="' + pendDay + '" data-id="' + x.id + '">+ ' + esc(x.title) + "</button>").join("") + "</div></div>" : "") +
    (ol.length ? '<div><p class="hint">Metas prontas para fazer:</p><div class="row">' + ol.map(id => '<button class="chip butter" data-act="planaddnode" data-id="' + id + '">+ ' + esc(node(id).title) + "</button>").join("") + "</div></div>" : "") +
  "</div>" : "");
}
function taskForm(inputId, ph, forWhat, act, btn, primary) {
  return '<div class="taskform"><input type="text" id="' + inputId + '" placeholder="' + ph + '" aria-label="Nova tarefa">' +
    '<div class="row">' + nodeOptions(forWhat === "plan" ? ui.newPlanNode : "", forWhat) + colorPicker(ui.newColor) + '<button class="btn' + (primary ? " primary" : "") + '" data-act="' + act + '">' + btn + "</button></div></div>";
}
function colorPicker(sel) {
  return '<div class="cpick" role="group" aria-label="Cor da tarefa"><span class="lab">Cor</span><button class="auto" data-act="newcolor" data-c="" aria-pressed="' + !sel + '" title="Automática: cor do objetivo ou aleatória">Auto</button>' +
    COLORS.map(c => '<button class="sw" style="background:var(--' + c + ');border-color:var(--' + c + '-ink)" data-act="newcolor" data-c="' + c + '" aria-pressed="' + (sel === c) + '" aria-label="' + COLOR_NAMES[c] + '" title="' + COLOR_NAMES[c] + '"></button>').join("") + "</div>";
}
/* Card de foco: estrutura fixa (título, relógio, barra, bloco de apoio, botões) em todos os estados, para o layout não pular. */
function focusShell({ eyebrow, title, digits, pct, extra, buttons, color, live }) {
  return '<div class="focus shell"' + (live ? ' aria-live="polite"' : "") + ' style="border-left:10px solid var(--' + (color || "lilac") + '-ink)">' +
    '<p class="eyebrow">' + eyebrow + "</p>" +
    '<p class="ftitle">' + (title || "&nbsp;") + "</p>" +
    '<div class="digits" id="digits">' + digits + "</div>" +
    '<div class="bar" id="bar"><i style="width:' + pct.toFixed(2) + '%"></i></div>' +
    '<div class="xtra">' + (extra || "") + "</div>" +
    '<div class="row">' + buttons + "</div></div>";
}
function focusCard() {
  const S = state.settings;
  if (ui.step === "running" && ui.timer) {
    const T = ui.timer, left = timeLeft(), it = timerItem(), c = it ? taskColor(it) : "lilac";
    const feelToday = L(todayKey()).f || [];
    const opts = ["Ansiedade", "Tédio", "Cansaço", "Confusão", "Medo de ficar ruim", "Nada demais"];
    const brkName = T.long ? "Descanso longo" : "Descanso";
    return focusShell({
      live: true, color: c, pct: 100 * (1 - left / T.total), digits: fmtMs(left),
      eyebrow: (T.phase === "focus" ? "Foco" : brkName) + (T.paused ? " · pausado" : ""),
      title: T.phase === "focus" && it ? esc(it.title) + (metaText(it) ? ' <span class="muted fmeta">· ' + metaText(it) + "</span>" : "") : (T.phase === "break" ? "Hora de descansar" : ""),
      extra: T.phase === "focus" ? '<p class="hint" style="margin-bottom:6px">Como você está agora? (opcional) · Espaço pausa e continua</p><div class="feel">' + opts.map(o => '<button data-act="feel2" data-v="' + esc(o) + '" aria-pressed="' + feelToday.includes(o) + '">' + esc(o) + "</button>").join("") + "</div>" : '<p class="muted">Levante, beba água, olhe para longe. O celular continua longe.</p>',
      buttons: (T.paused ? '<button class="btn primary" data-act="resume">Continuar</button>' : '<button class="btn" data-act="pause">Pausar</button>') +
        '<button class="btn" data-act="stop">' + (T.phase === "focus" ? "Encerrar sessão" : "Pular descanso") + "</button>"
    });
  }
  if (ui.step === "after") {
    const t = itemById(ui.lastTask), br = breakInfo(), n = L(todayKey()).s || 0, c = t ? taskColor(t) : "lilac";
    const brkBtn = '<button class="btn primary" data-act="break">Iniciar descanso' + (br.long ? " longo" : "") + " · " + br.min + " min</button>";
    if (t && t.done) {
      return focusShell({ live: true, color: c, pct: 100, digits: "00:00", eyebrow: "Tarefa concluída", title: "“" + esc(t.title) + "” concluída",
        extra: '<p class="muted">Hora de descansar.</p>', buttons: brkBtn + '<button class="btn" data-act="endday">Agora não</button>' });
    }
    const linked = t && t.node && node(t.node) && !node(t.node).done;
    return focusShell({ live: true, color: c, pct: 100, digits: "00:00", eyebrow: "Tempo! Pomodoro " + n + " concluído",
      title: t ? "“" + esc(t.title) + "”" : "Bom trabalho.",
      extra: (br.long ? '<p class="muted">Você completou 4 pomodoros: o descanso agora é o longo.</p>' : '<p class="muted">Descanse agora ou conclua a tarefa, se ela terminou.</p>') +
        (linked ? '<button class="btn small ghost" data-act="afteryes" data-node="1">Concluir a tarefa e a meta “' + esc(node(t.node).title) + "”</button>" : ""),
      buttons: brkBtn + (t ? '<button class="btn" data-act="afteryes">Concluir</button>' : "") });
  }
  /* Pronto para começar: sem timer rodando, o relógio já aparece e a pessoa só toca em Iniciar. */
  const nx = nextItem(), fromBreak = ui.step === "breakend";
  return focusShell({
    color: nx ? taskColor(nx) : "lilac", pct: 0, digits: fmtMs(S.focus * 60000),
    eyebrow: fromBreak ? "Descanso terminado" : "Pronto para começar",
    title: nx ? esc(nx.title) + (metaText(nx) ? ' <span class="muted fmeta">· ' + metaText(nx) + "</span>" : "") : "Nenhuma tarefa pendente",
    extra: '<p class="muted">' + (nx ? "Toque em Iniciar quando estiver pronto. São " + S.focus + " minutos de foco." : "Escreva uma tarefa abaixo para começar.") + "</p>",
    buttons: '<button class="btn primary" data-act="tstart" data-id="' + (nx ? nx.id : "") + '"' + (nx ? "" : " disabled") + ">▶ Iniciar</button>"
  });
}
function taskEditRow(it) {
  const c = taskColor(it), ol = undoneNodes();
  if (it.node && node(it.node) && !ol.includes(it.node)) ol.unshift(it.node);
  return '<li class="trow editing" style="--tc:var(--' + c + ');--tci:var(--' + c + '-ink)"><span class="tcolor" aria-hidden="true"></span>' +
    '<div class="tedit"><input type="text" id="te-' + it.id + '" value="' + esc(it.title) + '" aria-label="Nome da tarefa" maxlength="200">' +
    '<div class="metarow"><label for="tm-' + it.id + '">Meta</label><select id="tm-' + it.id + '"><option value="">Tarefa livre</option>' +
      ol.map(id => '<option value="' + id + '"' + (it.node === id ? " selected" : "") + ">" + esc(node(id).title) + " · " + esc((rootOf(id) || {}).title || "") + "</option>").join("") + "</select></div>" +
    '<div class="row"><button class="btn small primary" data-act="teditok" data-id="' + it.id + '">Salvar</button><button class="btn small ghost" data-act="teditcancel">Cancelar</button></div></div></li>';
}
function taskRow(it, tid, isNext) {
  if (ui.editTask === it.id) return taskEditRow(it);
  const c = taskColor(it);
  const st = it.done ? "done" : (it.id === tid && !it.paused ? "running" : (it.paused ? "paused" : "todo"));
  const runningNow = st === "running" && ui.timer && !ui.timer.paused;
  const playLabel = it.paused && tid === it.id ? "Retomar" : (runningNow ? "Em foco" : "Iniciar");
  return '<li class="trow ' + st + (isNext && st === "todo" ? " next" : "") + '" style="--tc:var(--' + c + ');--tci:var(--' + c + '-ink)">' +
    '<span class="tcolor" aria-hidden="true"></span>' +
    '<div class="tmain editable" data-act="tedit" data-id="' + it.id + '" role="button" tabindex="0" aria-label="Editar tarefa: ' + esc(it.title) + '" title="Clique para editar"><span class="t">' + esc(it.title) + '</span><span class="tm">' + metaText(it) + "</span></div>" +
    '<div class="tchips">' + (st === "running" ? '<span class="chip">em foco</span>' : "") + (isNext && st === "todo" ? '<span class="chip">próxima</span>' : "") + (it.done ? '<span class="chip mint">concluída</span>' : "") + (it.extra ? '<span class="chip peach">extra</span>' : "") + "</div>" +
    (it.done ? '<div class="tbtns"><button class="tb" data-act="treopen" data-id="' + it.id + '" aria-label="Reiniciar ' + esc(it.title) + '">↺ Reiniciar</button></div>'
      : '<div class="tbtns"><button class="tb play' + (runningNow ? " on" : "") + '" data-act="tstart" data-id="' + it.id + '"' + (runningNow ? " disabled" : "") + ">▶ " + playLabel + "</button>" +
        '<button class="tb" data-act="tpause" data-id="' + it.id + '"' + (it.paused ? " disabled" : "") + ">❚❚ Pausar</button>" +
        (st === "running" ? "" : '<button class="tb" data-act="planrm" data-id="' + it.id + '" aria-label="Remover ' + esc(it.title) + '" title="Remover tarefa">✕</button>') + "</div>") +
    "</li>";
}
function planPanel(k) {
  const p = peekPlan(k), list = sortedItems(p), doneN = p.items.filter(i => i.done).length;
  const tid = ui.timer && ui.timer.phase === "focus" ? ui.timer.taskId : null;
  const todo = list.filter(i => !i.done && !i.paused), paused = list.filter(i => !i.done && i.paused), done = list.filter(i => i.done);
  const nx = !tid ? nextItem() : null;
  const group = (lab, arr) => arr.length ? '<li class="tgroup">' + lab + " · " + arr.length + "</li>" + arr.map(i => taskRow(i, tid, nx && nx.id === i.id)).join("") : "";
  return '<div class="panel"><div class="panel-head"><h2>Tarefas do dia</h2>' + (p.items.length ? '<span class="chip mint">' + doneN + " de " + p.items.length + " feitas</span>" : "") + "</div>" +
    taskForm("plan-in", "Escreva a tarefa", "plan", "planadd", "Adicionar tarefa", true) +
    suggestions(k) +
    (p.items.length ? '<ul class="tlist">' + group("A fazer", todo) + group("Pausadas", paused) + group("Concluídas", done) + "</ul>" : '<p class="hint">Nenhuma tarefa ainda. Escreva a primeira acima e toque em Iniciar para começar um pomodoro.</p>') +
    "</div>";
}
function weekStrip(test, color) {
  const tk = todayKey(), mon = mondayOf(new Date());
  let s = "";
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i), k = dayKey(d), fut = k > tk, ok = !fut && test(k);
    s += '<span class="' + (ok ? "on" : "") + (fut ? " fut" : "") + (k === tk ? " today" : "") + '"' + (ok ? ' style="background:var(--' + color + '-ink);border-color:var(--' + color + '-ink)"' : "") + ' title="' + DOW[i] + (ok ? ": feito" : "") + '">' + DOW1[i] + "</span>";
  }
  return '<div class="wstrip" aria-label="Esta semana">' + s + "</div>";
}
function prodCard() {
  const k = todayKey(), S = state.settings, p = peekPlan(k), s = L(k).s || 0;
  const tdone = p.items.filter(i => i.done).length, tn = p.items.length, pct = tn ? Math.round(100 * tdone / tn) : 0;
  return '<div class="habit prod">' +
    '<div class="habit-name"><span class="swatch" style="background:var(--lilac-ink)"></span>Produtividade</div>' +
    '<div class="prod-row"><div class="lab">Tarefas</div>' + (tn ? '<div class="progress"><div class="wbar"><i style="width:' + pct + '%;background:var(--lilac-ink)"></i></div><b>' + tdone + "/" + tn + "</b></div>" : '<span class="hint">Nenhuma tarefa hoje</span>') + "</div>" +
    '<div class="prod-row"><div class="lab">Pomodoros</div><div class="row">' + pips(s, S.goal, S.min) + "<b>" + s + "/" + S.goal + "</b></div></div>" +
    '<div class="hstat"><span><b>' + dailyStreak(focusDone, { skipWeekend: true }) + "</b>dias seguidos</span><span><b>" + bestDaily(focusDone, true) + "</b>recorde</span></div>" +
    weekStrip(focusDone, "lilac") +
    "</div>";
}
function habitCard(h) {
  const k = todayKey(), S = state.settings, v = hv(k, h), test = kk => hDone(kk, h);
  let ctl;
  if (h.kind === "count") ctl = '<label class="numin">Hoje <input type="number" min="0" max="9999" data-field="habitnum" data-id="' + h.id + '" value="' + (Number(v) || "") + '" placeholder="0" aria-label="' + esc(h.name) + ' hoje"> ' + esc(h.unit || "") + "</label>";
  else ctl = '<button class="toggle" style="--hc:var(--' + h.color + '-ink)" data-act="habit" data-id="' + h.id + '">✓ Feito</button>';
  const stats = h.per === "week"
    ? '<div class="hstat"><span><b>' + weekCount(mondayOf(new Date()), h) + "/" + h.n + "</b>nesta semana</span><span><b>" + weeklyStreak(h) + "</b>semanas seguidas</span></div>"
    : '<div class="hstat"><span><b>' + dailyStreak(test) + "</b>dias seguidos</span><span><b>" + bestDaily(test) + "</b>recorde</span></div>";
  const sub = h.wake ? "até " + esc(S.wake) : (h.kind === "count" ? "meta: " + h.n + " " + esc(h.unit || "") + (h.per === "week" ? " na semana" : " por dia") : (h.per === "week" ? h.n + "× por semana" : "todo dia"));
  return '<div class="habit"><div class="habit-top"><div><div class="habit-name"><span class="swatch" style="background:var(--' + h.color + '-ink)"></span>' + esc(h.name) + '</div><span class="hint">' + sub + "</span></div>" + ctl + "</div>" + stats + weekStrip(test, h.color) + "</div>";
}
function habitsPanel() {
  const k = todayKey();
  const showProd = !allTasksDone(k);
  const pending = state.habits.filter(h => !hDone(k, h));
  const head = '<div class="panel-head"><h2>Hábitos de hoje</h2><button class="btn small ghost" data-act="nav" data-v="ajustes">Gerenciar hábitos</button></div>';
  if (!showProd && !pending.length) return '<div class="panel">' + head + '<div class="allset">Tarefas e hábitos de hoje concluídos. Tudo volta amanhã.</div></div>';
  const right = pending.length ? pending.map(habitCard).join("") : '<div class="allset">Todos os hábitos de hoje estão feitos. Eles voltam amanhã.</div>';
  return '<div class="panel">' + head + '<div class="hgrid' + (showProd ? "" : " noprod") + '">' + (showProd ? prodCard() : "") + '<div class="habits">' + right + "</div></div></div>";
}

/* ---------- OBJETIVOS ---------- */
function nodeHTML(id, isRoot) {
  const n = node(id); if (!n) return "";
  const leaf = isLeaf(n), done = !!n.done, sel = ui.sel === id;
  const kids = n.children || [], kd = kids.filter(c => node(c) && node(c).done).length;
  const readyToClose = !done && !leaf && kd === kids.length;
  const cls = "node" + (isRoot ? " root" : "") + (done ? " isdone" : ((leaf || readyToClose) ? " ready" : "")) + (sel ? " sel" : "");
  let chip;
  if (isRoot) { const all = subtree(id), d = all.filter(x => node(x).done).length; chip = done ? '<span class="chip mint">objetivo conquistado</span>' : '<span class="chip">objetivo final · ' + d + "/" + all.length + "</span>"; }
  else if (done) chip = '<span class="chip mint">concluída</span>';
  else if (leaf) chip = '<span class="chip butter">pronta para fazer</span>';
  else if (readyToClose) chip = '<span class="chip butter">pronta para concluir</span>';
  else chip = '<span class="chip plain">' + kd + " de " + plural(kids.length, "galho") + "</span>";
  const body = ui.edit === id
    ? '<input type="text" id="edit-' + id + '" value="' + esc(n.title) + '" aria-label="Novo nome"><div class="row"><button class="btn small primary" data-act="editok" data-id="' + id + '">Salvar</button><button class="btn small ghost" data-act="editcancel">Cancelar</button></div>'
    : '<div class="nt">' + esc(n.title) + "</div>";
  const items = itemsForNode(id);
  let acts = "";
  if (sel && ui.edit !== id) {
    if (ui.branch === id) {
      acts = '<div class="acts"><span class="hint">Novo galho abaixo desta meta:</span><input type="text" id="br-' + id + '" placeholder="ex.: Revisar a seção 2.1" aria-label="Novo galho"><button class="btn small primary" data-act="branchok" data-id="' + id + '">Adicionar galho</button><button class="btn small ghost" data-act="branchcancel">Cancelar</button></div>';
    } else if (ui.confirmDel === id) {
      acts = '<div class="acts"><span class="hint">Apagar ' + (leaf ? "esta meta" : "esta meta e todos os galhos abaixo dela") + '?</span><button class="btn small danger" data-act="delok" data-id="' + id + '">Sim, apagar</button><button class="btn small ghost" data-act="delcancel">Cancelar</button></div>';
    } else {
      acts = '<div class="acts">' +
        (!done ? '<button class="btn small primary" data-act="nodedone" data-id="' + id + '">' + (isRoot ? "Conquistar objetivo" : "Concluir") + "</button>" : '<button class="btn small" data-act="nodeundo" data-id="' + id + '">Desfazer conclusão</button>') +
        (!done && !isRoot ? '<button class="btn small" data-act="nodetoday" data-id="' + id + '">Planejar para hoje</button>' : "") +
        (!done ? '<button class="btn small" data-act="branch" data-id="' + id + '">Adicionar galho</button>' : "") +
        '<button class="btn small" data-act="edit" data-id="' + id + '">Renomear</button>' +
        '<button class="btn small ghost danger" data-act="del" data-id="' + id + '">Apagar</button></div>';
    }
  }
  const tint = isRoot && !done && n.color ? ' style="background:var(--' + n.color + ");border-color:var(--" + n.color + '-ink)"' : "";
  const box = '<div class="' + cls + '"' + tint + ' data-act="selnode" data-id="' + id + '" role="button" tabindex="0" aria-pressed="' + sel + '">' + chip + body + (items ? '<span class="hint">' + plural(items, "tarefa feita", "tarefas feitas") + "</span>" : "") + acts + "</div>";
  const sub = kids.length ? "<ul>" + kids.map(c => nodeHTML(c, false)).join("") + "</ul>" : "";
  return '<li class="' + (done ? "done" : "") + '">' + box + sub + "</li>";
}
function vObjetivos() {
  const roots = G().roots.filter(r => node(r));
  return '<section class="view">' +
    '<div class="head"><div><p class="eyebrow">Do topo até a base</p><h1>Objetivos</h1></div></div>' +
    '<p class="lead">O objetivo final fica no topo. Adicione galhos um por vez, quantos cada meta precisar, até chegar a passos que caibam em poucas sessões. Conclua cada meta quando você decidir que ela está pronta, inclusive as de cima. Toque num quadro para ver as ações.</p>' +
    '<div class="legend"><span><i class="swatch" style="background:var(--butter);border:1px solid var(--butter-ink)"></i>pronta para fazer ou concluir</span><span><i class="swatch" style="background:var(--mint);border:1px solid var(--mint-ink)"></i>concluída</span><span><i class="swatch" style="background:var(--surface);border:1px solid var(--line)"></i>galhos em andamento</span><span><i class="swatch" style="background:var(--lilac);border:1px solid var(--lilac-ink)"></i>objetivo final</span></div>' +
    roots.map(r => {
      const all = subtree(r), d = all.filter(x => node(x).done).length, pct = all.length ? Math.round(100 * d / all.length) : 0;
      return '<div class="panel goal-card" style="border-top:6px solid var(--' + (node(r).color || "lilac") + '-ink)"><div class="panel-head"><h2>' + esc(node(r).title) + '</h2><div class="row"><div class="cpick" role="group" aria-label="Cor do objetivo"><span class="lab">Cor das tarefas</span>' + COLORS.map(c => '<button class="sw" style="background:var(--' + c + ');border-color:var(--' + c + '-ink)" data-act="rootcolor" data-id="' + r + '" data-c="' + c + '" aria-pressed="' + (node(r).color === c) + '" aria-label="' + COLOR_NAMES[c] + '" title="' + COLOR_NAMES[c] + '"></button>').join("") + '</div><span class="hint">' + d + " de " + plural(all.length, "meta") + " concluídas</span></div></div>" +
        '<div class="progress"><div class="wbar"><i style="width:' + pct + '%"></i></div><b>' + pct + "%</b></div>" +
        '<div class="tree-scroll"><div class="tree"><ul>' + nodeHTML(r, true) + "</ul></div></div></div>";
    }).join("") +
    '<div class="panel"><h2>Novo objetivo</h2><p class="hint">Escreva o resultado final, do jeito que você vai saber que chegou lá.</p><div class="row"><input type="text" class="grow" id="goal-in" placeholder="ex.: Submeter o artigo para o congresso" aria-label="Novo objetivo"><button class="btn primary" data-act="addgoal">Criar objetivo</button></div></div>' +
    '<details class="why"><summary>Por que funciona assim?</summary><p><b>Por que dividir até a base?</b> Metas próximas aumentam a sensação de capacidade e o interesse pela tarefa (Bandura e Schunk, 1981). Tarefas grandes e vagas são as mais adiadas (Steel, 2007).</p></details>' +
    "</section>";
}

/* ---------- SEMANA ---------- */
const DOWS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
function weekNav(off, act) {
  const mon = addDays(mondayOf(new Date()), off * 7), sun = addDays(mon, 6);
  return '<div class="weeknav"><button class="btn small" data-act="' + act + '" data-d="-1" aria-label="Semana anterior">‹ Anterior</button><span class="range">' + fmtShort(mon) + " a " + fmtShort(sun) + '</span><button class="btn small" data-act="' + act + '" data-d="1" aria-label="Próxima semana">Próxima ›</button>' + (off ? '<button class="btn small ghost" data-act="' + act + '" data-d="0">Esta semana</button>' : "") + "</div>";
}
function weekStats(mon) {
  const days = []; for (let i = 0; i < 7; i++) days.push(addDays(mon, i));
  let met = 0, any = 0, sess = 0, planned = 0, pdone = 0;
  days.forEach(d => {
    const k = dayKey(d), s = L(k).s || 0, p = peekPlan(k);
    sess += s; if (s > 0) any++;
    if (isWeekday(d) && s >= goalOf(k)) met++;
    planned += p.items.length; pdone += p.items.filter(i => i.done).length;
  });
  return { days, met, any, sess, planned, pdone };
}
function weekMetrics(mon) {
  const st = weekStats(mon), hab = {};
  state.habits.forEach(h => {
    let days = 0, sum = 0;
    st.days.forEach(d => { const k = dayKey(d); if (hDone(k, h)) days++; if (h.kind === "count") sum += Number(hv(k, h)) || 0; });
    hab[h.id] = { days, sum };
  });
  st.hab = hab; st.tpct = st.planned ? st.pdone / st.planned : null;
  return st;
}
function ring(frac, color, big) {
  const r = 26, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, frac || 0)), sz = big ? 92 : 72;
  return '<svg class="ring" viewBox="0 0 64 64" width="' + sz + '" height="' + sz + '" aria-hidden="true"><circle cx="32" cy="32" r="' + r + '" fill="none" stroke="var(--' + color + ')" stroke-width="8"/>' +
    (p > 0 ? '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="var(--' + color + '-ink)" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c * p).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 32 32)"/>' : "") +
    '<text x="32" y="37" text-anchor="middle" class="ring-t">' + Math.round(p * 100) + "%</text></svg>";
}
function statTiles(st, mon) {
  const S = state.settings;
  const tile = (c, n, of, l) => '<div class="stat ' + c + '"><div class="n">' + n + (of != null ? " <small>de " + of + "</small>" : "") + '</div><div class="l">' + l + "</div></div>";
  return '<div class="stats">' + tile("lilac", st.sess, null, "pomodoros (" + Math.round(st.sess * S.focus / 6) / 10 + " h)") + tile("mint", st.met, 5, "dias úteis com a meta") + tile("sky", st.pdone, st.planned, "tarefas do dia feitas") +
    state.habits.slice(0, 2).map(h => tile(h.color, weekCount(mon, h), h.per === "week" ? h.n : 7, esc(h.name).toLowerCase())).join("") + "</div>";
}
function heatCell(frac, color, label, fut, title) {
  if (fut) return '<td><span class="hc fut" title="' + esc(title) + '"></span></td>';
  const a = frac == null ? 0 : Math.max(0, Math.min(1, frac));
  const bg = frac == null ? "var(--paper)" : (a === 0 ? "var(--surface)" : "color-mix(in srgb, var(--" + color + "-ink) " + Math.round(18 + a * 62) + "%, var(--" + color + "))");
  const fg = a >= 0.6 ? "#fff" : "var(--ink)";
  return '<td><span class="hc" style="background:' + bg + ";color:" + fg + '" title="' + esc(title) + '">' + label + "</span></td>";
}
function vSemana() {
  const mon = addDays(mondayOf(new Date()), ui.weekOff * 7), st = weekMetrics(mon), tk = todayKey(), S = state.settings;
  const goalSum = st.days.filter(isWeekday).reduce((s, d) => s + goalOf(dayKey(d)), 0);
  const rc = (frac, color, title, sub) => '<div class="ringcard">' + ring(frac, color) + '<div><b>' + title + '</b><span class="hint">' + sub + "</span></div></div>";
  const rings = rc(st.tpct, "sky", "Tarefas do dia", st.pdone + " de " + st.planned + " feitas") +
    rc(goalSum ? st.sess / goalSum : 0, "lilac", "Pomodoros", st.sess + " de " + goalSum + " · " + Math.round(st.sess * S.focus / 6) / 10 + " h") +
    rc(st.met / 5, "mint", "Dias úteis na meta", st.met + " de 5") +
    state.habits.map(h => { const of = h.per === "week" ? h.n : 7, c = st.hab[h.id].days; return rc(c / of, h.color, esc(h.name), c + " de " + of + (h.kind === "count" ? " · " + st.hab[h.id].sum + " " + esc(h.unit || "") : "")); }).join("");
  const head = "<tr><th></th>" + st.days.map((d, i) => '<th class="' + (dayKey(d) === tk ? "tday" : "") + '">' + DOWS[i] + "<small>" + fmtShort(d) + "</small></th>").join("") + "<th>Semana</th></tr>";
  const rowT = '<tr><th scope="row">Tarefas do dia</th>' + st.days.map(d => { const k = dayKey(d), p = peekPlan(k), n = p.items.length, dn = p.items.filter(i => i.done).length; return heatCell(n ? dn / n : null, "sky", n ? dn + "/" + n : "", k > tk && !n, fmtShort(d)); }).join("") + '<td class="tot">' + (st.planned ? Math.round(100 * st.tpct) + "%" : "–") + "</td></tr>";
  const rowP = '<tr><th scope="row">Pomodoros</th>' + st.days.map(d => { const k = dayKey(d), s = L(k).s || 0, g = isWeekday(d) ? goalOf(k) : 0; return heatCell(g ? s / g : (s ? 1 : null), "lilac", s || "", k > tk, fmtShort(d)); }).join("") + '<td class="tot">' + st.sess + "</td></tr>";
  const rowsH = state.habits.map(h => '<tr><th scope="row">' + esc(h.name) + "</th>" + st.days.map(d => { const k = dayKey(d), ok = hDone(k, h), v = hv(k, h); return heatCell(ok ? 1 : 0, h.color, ok ? (h.kind === "count" ? (Number(v) || "") : "✓") : (h.kind === "count" && Number(v) ? Number(v) : ""), k > tk, fmtShort(d)); }).join("") + '<td class="tot">' + st.hab[h.id].days + "/" + (h.per === "week" ? h.n : 7) + "</td></tr>").join("");
  return '<section class="view">' +
    '<div class="head"><div><p class="eyebrow">A semana inteira de uma vez</p><h1>Semana</h1></div>' + weekNav(ui.weekOff, "weeknav") + "</div>" +
    '<div class="panel"><h2>Progresso da semana</h2><div class="rings">' + rings + "</div></div>" +
    '<div class="panel"><div class="panel-head"><h2>Dia a dia</h2><span class="hint">Quanto mais forte a cor, mais perto do completo</span></div><div class="heat-scroll"><table class="heat">' + head + rowT + rowP + rowsH + "</table></div></div>" +
    '<details class="panel daydetails"' + (ui.daysOpen ? " open" : "") + '><summary><h2>Detalhes por dia</h2><span class="chev" aria-hidden="true">▾</span></summary>' +
    '<div class="wlist">' + st.days.map((d, i) => {
      const k = dayKey(d), l = L(k), s = l.s || 0, wd = isWeekday(d), p = peekPlan(k), past = k < tk, fut = k > tk;
      const n = p.items.length, dn = p.items.filter(it => it.done).length, g = wd ? goalOf(k) : 0;
      const items = n ? "<ul>" + p.items.map(it => '<li class="' + (it.done ? "done" : (past ? "miss" : "")) + '"><span class="mk" aria-hidden="true" style="border-color:var(--' + taskColor(it) + '-ink)">' + (it.done ? "✓" : "") + "</span><span>" + esc(it.title) + "</span>" + (fut && !p.locked ? '<button class="btn small ghost danger" style="min-height:28px;padding:2px 8px;margin-left:auto" data-act="futrm" data-day="' + k + '" data-id="' + it.id + '" aria-label="Remover">×</button>' : "") + "</li>").join("") + "</ul>" : '<p class="hint">' + (fut ? "Nada planejado ainda." : (k === tk ? "Dia ainda não iniciado." : "Sem tarefas.")) + "</p>";
      const add = fut ? '<div class="row" style="margin-top:8px"><input type="text" class="grow" id="fut-' + k + '" placeholder="Pré-planejar uma tarefa" aria-label="Pré-planejar tarefa para ' + DOW[i] + '"><button class="btn small" data-act="futadd" data-day="' + k + '">Adicionar</button></div>' : "";
      const bar = (frac, color, lab, val) => '<div class="mini"><div class="mini-top"><span>' + lab + "</span><b>" + val + '</b></div><div class="wbar"><i style="width:' + Math.round(100 * Math.min(1, frac || 0)) + "%;background:var(--" + color + '-ink)"></i></div></div>';
      return '<div class="wrow' + (k === tk ? " today" : "") + (wd ? "" : " weekend") + '">' +
        '<div class="wday"><b>' + DOW[i] + "</b><span>" + fmtShort(d) + (k === tk ? ' · <span class="chip">hoje</span>' : "") + "" + "</span></div>" +
        '<div class="wprog">' + bar(n ? dn / n : 0, "sky", "Tarefas", n ? dn + "/" + n : "–") + bar(g ? s / g : (s ? 1 : 0), "lilac", "Pomodoros", wd ? s + "/" + g : (s || "–")) + "</div>" +
        '<div><div class="wcol-label">Hábitos</div><div class="whab">' + state.habits.map(h => '<span class="chip ' + (fut ? "plain" : (hDone(k, h) ? h.color : "plain")) + '">' + (!fut && hDone(k, h) ? "✓ " : "") + esc(h.name) + "</span>").join("") + "</div></div>" +
        '<div class="wplan"><div class="wcol-label">Tarefas do dia</div>' + items + add + "</div>" +
        "</div>";
    }).join("") + "</div></details>" +
    reviewSection(mon, st) +
    '<details class="why"><summary>Por que funciona assim?</summary><p><b>Por que ver a semana toda?</b> Num estudo de 2023, quem planejou em agendas que mostram a semana inteira concluiu mais tarefas do que quem usou o calendário do celular, que mostra um dia por vez (Yang, Huang e Morwitz). Dias sem registro ficam claros, sem vermelho: o objetivo é retomar, não se punir. <b>Por que revisar e relatar?</b> Acompanhar o progresso aumentou o alcance de metas, e o efeito foi maior quando o progresso era registrado e relatado a outras pessoas (Harkin et al., 2016).</p></details>' +
    "</section>";
}

/* ---------- REVISÃO ---------- */
function reviewSection(mon, st) {
  const S = state.settings, sun = addDays(mon, 6), wk = dayKey(mon), r = state.reviews[wk] || {};
  const doneNodes = Object.values(G().nodes).filter(n => n.done && n.doneAt && n.doneAt >= mon.getTime() && n.doneAt < addDays(mon, 7).getTime()).map(n => n.title);
  const ni = nextItem();
  const msg = "Semana de " + fmtShort(mon) + " a " + fmtShort(sun) + ": " + plural(st.sess, "pomodoro") + " (" + Math.round(st.sess * S.focus / 6) / 10 + " h) em " + plural(st.any, "dia") + ".\n" +
    "Tarefas do dia feitas: " + st.pdone + " de " + st.planned + ".\n" +
    (doneNodes.length ? "Metas concluídas: " + doneNodes.join("; ") + ".\n" : "") +
    "Próximo passo: " + (ni ? ni.title : "a definir") + "." + (r.adj ? "\nAjuste para a próxima semana: " + r.adj : "");
  let level;
  const dow = new Date().getDay(), late = ui.weekOff < 0 || dow === 5 || dow === 6 || dow === 0;
  if (st.met >= 4 && S.goal < 8) level = "<p>Você cumpriu a meta em " + st.met + " de 5 dias úteis. Pode subir de nível.</p><button class=\"btn primary\" data-act=\"level\" data-d=\"1\" style=\"justify-self:start\">Subir para " + plural(S.goal + 1, "pomodoro") + "</button>";
  else if (late && st.met <= 1 && S.goal > 1) level = "<p>A meta foi cumprida em " + st.met + " de 5 dias úteis. Descer um nível costuma funcionar melhor do que insistir.</p><button class=\"btn\" data-act=\"level\" data-d=\"-1\" style=\"justify-self:start\">Descer para " + plural(S.goal - 1, "pomodoro") + "</button>";
  else level = "<p>Mantenha o nível. Suba só depois de cumprir a meta em pelo menos 4 de 5 dias úteis.</p>";
  return '<div class="sec-title" id="rev-sec"><h2>Revisão da semana</h2><span class="hint">Toda sexta, 15 minutos</span></div>' +
    '<div class="grid2">' +
      '<div class="panel"><h2>O que mais atrapalhou?</h2><textarea aria-label="O que mais atrapalhou" data-field="rev" data-k="ob" data-week="' + wk + '" placeholder="ex.: acordei tarde na quarta e perdi o horário da manhã">' + esc(r.ob || "") + "</textarea>" +
      '<h2>Um ajuste só para a próxima semana</h2><textarea aria-label="Ajuste da próxima semana" data-field="rev" data-k="adj" data-week="' + wk + '" placeholder="ex.: deixar o celular carregando na sala">' + esc(r.adj || "") + "</textarea></div>" +
      '<div class="panel"><h2>Nível: ' + plural(S.goal, "pomodoro") + " por dia útil</h2>" + level +
        '<h2 style="margin-top:6px">Mensagem para quem acompanha você</h2><div class="msg" id="msg">' + esc(msg) + '</div><button class="btn primary" data-act="copymsg" style="justify-self:start">Copiar mensagem</button></div>' +
    "</div>" +
    '<div class="panel chart"><h2>Pomodoros por semana</h2>' + weeksChart() + "</div>";
}
function weeksChart() {
  const mon0 = mondayOf(new Date()), W = 8, data = [];
  for (let i = W - 1; i >= 0; i--) { const m = addDays(mon0, -7 * i); data.push({ m, v: weekStats(m).sess }); }
  const max = Math.max(5, ...data.map(d => d.v)), top = Math.ceil(max / 5) * 5;
  const w = 640, h = 190, pl = 30, pb = 26, pt = 14, bw = (w - pl - 8) / W;
  let g = "";
  for (let i = 0; i <= 5; i++) { const y = top * i / 5, yy = pt + (h - pt - pb) * (1 - y / top); g += '<line x1="' + pl + '" x2="' + w + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--line)" stroke-width="1"/><text x="' + (pl - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + y + "</text>"; }
  data.forEach((d, i) => {
    const bh = (h - pt - pb) * (d.v / top), x = pl + i * bw + bw * 0.2, y = h - pb - bh, cur = i === W - 1;
    g += '<rect x="' + x + '" y="' + y + '" width="' + bw * 0.6 + '" height="' + Math.max(bh, 0) + '" rx="5" fill="' + (cur ? "var(--accent)" : "var(--lilac)") + '" stroke="' + (cur ? "none" : "var(--lilac-ink)") + '" stroke-opacity=".35"/>';
    if (d.v) g += '<text x="' + (x + bw * 0.3) + '" y="' + (y - 5) + '" text-anchor="middle" style="fill:var(--ink);font-weight:600">' + d.v + "</text>";
    g += '<text x="' + (x + bw * 0.3) + '" y="' + (h - 8) + '" text-anchor="middle">' + fmtShort(d.m) + "</text>";
  });
  return '<svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="Pomodoros nas últimas 8 semanas">' + g + "</svg>";
}

/* ---------- PERFIL ---------- */
function cmp(cur, prev) {
  if (prev == null) return { cls: "eq", txt: "sem semana anterior para comparar" };
  if (prev === 0) return cur > 0 ? { cls: "up", txt: "na semana passada não houve registro" } : { cls: "eq", txt: "igual à semana passada" };
  const d = Math.round(100 * (cur - prev) / prev);
  if (d === 0) return { cls: "eq", txt: "igual à semana passada" };
  return { cls: d > 0 ? "up" : "down", txt: (d > 0 ? Math.abs(d) + "% a mais" : Math.abs(d) + "% a menos") + " que na semana passada" };
}
const fmtNum = n => (Math.round(n * 10) / 10).toString().replace(".", ",");
function miniBars(vals, color, fmt) {
  const w = 220, h = 64, n = vals.length, bw = w / n, max = Math.max(1, ...vals.map(v => v || 0));
  let g = "";
  vals.forEach((v, i) => {
    const bh = (h - 16) * ((v || 0) / max), x = i * bw + bw * 0.18, y = h - 14 - bh, cur = i === n - 1;
    g += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + Math.max(bh, 1.5).toFixed(1) + '" rx="3" fill="var(--' + color + (cur ? "-ink" : "") + ')"' + (cur ? "" : ' stroke="var(--' + color + '-ink)" stroke-opacity=".35"') + "/>";
    if (cur && v) g += '<text x="' + (x + bw * 0.32).toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" text-anchor="middle" class="mb-t">' + (fmt ? fmt(v) : v) + "</text>";
  });
  g += '<text x="0" y="' + (h - 2) + '" class="mb-l">8 sem. atrás</text><text x="' + w + '" y="' + (h - 2) + '" text-anchor="end" class="mb-l">esta</text>';
  return '<svg viewBox="0 0 ' + w + " " + h + '" class="minibars" role="img" aria-label="Últimas 8 semanas">' + g + "</svg>";
}
function vPerfil() {
  const S = state.settings, mon0 = mondayOf(new Date());
  const weeks = []; for (let i = 7; i >= 0; i--) weeks.push(weekMetrics(addDays(mon0, -7 * i)));
  const cur = weeks[7], prev = weeks[6];
  const startDay = state.createdDay < earliestLog() ? state.createdDay : earliestLog();
  const prevExists = dayKey(addDays(mon0, -1)) >= startDay;
  const P = prevExists ? prev : null;
  const daysUsing = Math.max(1, Math.floor((new Date() - parseDay(startDay)) / 864e5) + 1);
  // totals
  let totS = 0, totT = 0; Object.values(state.log).forEach(l => totS += l.s || 0); Object.values(state.days).forEach(p => p.items.forEach(i => { if (i.done) totT++; }));
  const totN = Object.values(G().nodes).filter(n => n.done).length;
  const bestProd = bestDaily(focusDone, true);
  // insights
  const ins = [];
  const say = (color, text, c) => ins.push('<li style="border-left-color:var(--' + color + '-ink)"><p>' + text + "</p>" + (c ? '<span class="cmp ' + c.cls + '">' + (c.cls === "up" ? "▲ " : c.cls === "down" ? "▼ " : "") + c.txt + "</span>" : "") + "</li>");
  say("lilac", "Você fez <b>" + plural(cur.sess, "pomodoro") + "</b> nesta semana, " + fmtNum(cur.sess * S.focus / 60) + " h de foco.", cmp(cur.sess, P && P.sess));
  if (cur.planned || (P && P.planned)) say("sky", "Concluiu <b>" + (cur.planned ? Math.round(100 * cur.tpct) : 0) + "% das tarefas do dia</b> (" + cur.pdone + " de " + cur.planned + ").", P && P.planned ? { cls: (cur.tpct || 0) > P.tpct ? "up" : (cur.tpct || 0) < P.tpct ? "down" : "eq", txt: "na semana passada foram " + Math.round(100 * P.tpct) + "%" } : null);
  state.habits.forEach(h => {
    const c = cur.hab[h.id], p = P ? P.hab[h.id] : null;
    if (h.kind === "count") say(h.color, "<b>" + esc(h.name) + ":</b> " + c.sum + " " + esc(h.unit || "") + " nesta semana.", cmp(c.sum, p && p.sum));
    else say(h.color, "<b>" + esc(h.name) + ":</b> " + c.days + " de " + (h.per === "week" ? h.n : 7) + (h.per === "week" ? " vezes na meta da semana." : " dias nesta semana."), cmp(c.days, p && p.days));
  });
  const past4 = weeks.slice(3, 7).filter((w, i) => dayKey(addDays(mon0, -7 * (4 - i) + 6)) >= startDay);
  if (past4.length) { const avg = past4.reduce((s, w) => s + w.sess, 0) / past4.length; say("lilac", "Sua média nas " + plural(past4.length, "semana") + " anteriores foi de <b>" + fmtNum(avg) + " pomodoros</b> por semana.", { cls: cur.sess >= avg ? "up" : "down", txt: cur.sess >= avg ? "esta semana está acima da sua média" : "esta semana está abaixo da sua média" }); }
  const byDow = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
  weeks.forEach(w => w.days.forEach((d, i) => { const k = dayKey(d); if (k >= startDay && k <= todayKey()) { byDow[i] += L(k).s || 0; cnt[i]++; } }));
  const avgDow = byDow.map((v, i) => cnt[i] ? v / cnt[i] : 0), bi = avgDow.indexOf(Math.max(...avgDow));
  if (avgDow[bi] > 0) say("mint", "Seu dia mais produtivo tem sido <b>" + DOW[bi].toLowerCase() + "</b>, com média de " + fmtNum(avgDow[bi]) + " pomodoros.");
  const fc = {}; Object.keys(state.log).filter(k => k >= dayKey(addDays(new Date(), -29))).forEach(k => (L(k).f || []).forEach(f => fc[f] = (fc[f] || 0) + 1));
  const topF = Object.keys(fc).sort((a, b) => fc[b] - fc[a])[0];
  if (topF) say("rose", "Nos últimos 30 dias, o que você mais sentiu antes de começar foi <b>" + esc(topF.toLowerCase()) + "</b> (" + plural(fc[topF], "vez", "vezes") + "). " + (topF === "Nada demais" ? "" : "Vale ter um plano se–então para isso."));
  const topP = state.plans.slice().sort((a, b) => (b.uses || 0) - (a.uses || 0))[0];
  if (topP && topP.uses) say("peach", "Seu plano se–então mais usado: <b>" + esc(topP.a) + "</b> (" + plural(topP.uses, "vez", "vezes") + ").");
  // evolution cards
  const evo = (title, color, vals, curTxt, c, fmt) => '<div class="evo"><div class="evo-top"><span>' + title + '</span><b>' + curTxt + "</b></div>" + miniBars(vals, color, fmt) + (c ? '<span class="cmp ' + c.cls + '">' + (c.cls === "up" ? "▲ " : c.cls === "down" ? "▼ " : "") + c.txt + "</span>" : "") + "</div>";
  const evos = [
    evo("Pomodoros por semana", "lilac", weeks.map(w => w.sess), String(cur.sess), cmp(cur.sess, P && P.sess)),
    evo("Tarefas do dia concluídas", "sky", weeks.map(w => w.tpct == null ? 0 : Math.round(100 * w.tpct)), cur.planned ? Math.round(100 * cur.tpct) + "%" : "–", null, v => v + "%")
  ].concat(state.habits.map(h => h.kind === "count"
    ? evo(esc(h.name) + " (" + esc(h.unit || "") + ")", h.color, weeks.map(w => w.hab[h.id].sum), String(cur.hab[h.id].sum), cmp(cur.hab[h.id].sum, P && P.hab[h.id].sum))
    : evo(esc(h.name) + " (dias)", h.color, weeks.map(w => w.hab[h.id].days), cur.hab[h.id].days + "/" + (h.per === "week" ? h.n : 7), cmp(cur.hab[h.id].days, P && P.hab[h.id].days)))).join("");
  // pendências
  const tk = todayKey(), pend = [];
  Object.keys(state.days).filter(k => k < tk && k >= dayKey(addDays(new Date(), -30))).sort().reverse().forEach(k => state.days[k].items.forEach(i => { if (!i.done && !i.moved) pend.push({ k, i }); }));
  const pendHTML = pend.length ? '<ul class="plan-items">' + pend.slice(0, 15).map(x => '<li><span class="t">' + esc(x.i.title) + ' <span class="hint">· ' + DOW[(parseDay(x.k).getDay() + 6) % 7].toLowerCase() + " " + fmtShort(parseDay(x.k)) + "</span></span>" + metaChip(x.i) + '<button class="btn small" data-act="pendtoday" data-day="' + x.k + '" data-id="' + x.i.id + '">Levar para hoje</button></li>').join("") + "</ul>" + (pend.length > 15 ? '<p class="hint">E mais ' + (pend.length - 15) + ".</p>" : "") : '<div class="allset">Nenhuma tarefa pendente dos últimos 30 dias.</div>';
  const objs = G().roots.filter(r => node(r)).map(r => { const all = subtree(r), d = all.filter(x => node(x).done).length, pct = all.length ? Math.round(100 * d / all.length) : 0, open = all.filter(x => !node(x).done).length; return '<div class="objrow"><div class="mini-top"><span><b>' + esc(node(r).title) + '</b></span><span class="hint">' + plural(open, "meta aberta", "metas abertas") + "</span></div><div class=\"progress\"><div class=\"wbar\"><i style=\"width:" + pct + '%"></i></div><b>' + pct + "%</b></div></div>"; }).join("") || '<p class="hint">Nenhum objetivo criado.</p>';
  const unused = state.plans.filter(p => p.active && !p.uses);
  const tile = (c, n, l) => '<div class="stat ' + c + '"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>";
  return '<section class="view">' +
    '<div class="head"><div><p class="eyebrow">Usando desde ' + fmtShort(parseDay(startDay)) + " · " + plural(daysUsing, "dia") + '</p><h1>Perfil</h1></div></div>' +
    '<div class="stats">' + tile("lilac", fmtNum(totS * S.focus / 60) + " h", plural(totS, "pomodoro") + " no total") + tile("sky", totT, "tarefas concluídas") + tile("mint", totN, "metas concluídas") + tile("peach", bestProd, "maior sequência de dias úteis produtivos") + "</div>" +
    '<div class="panel"><h2>Sua semana em frases</h2><ul class="insights">' + ins.join("") + '</ul><p class="hint">As comparações usam o seu próprio histórico: semana passada e a sua média.</p></div>' +
    '<div class="panel"><h2>Evolução nas últimas 8 semanas</h2><div class="evos">' + evos + "</div></div>" +
    '<div class="grid2">' +
      '<div class="panel"><div class="panel-head"><h2>Pendências</h2><span class="chip ' + (pend.length ? "peach" : "mint") + '">' + pend.length + "</span></div>" + pendHTML + "</div>" +
      '<div class="panel"><h2>Objetivos</h2>' + objs + (unused.length ? '<p class="hint">' + plural(unused.length, "plano se–então ativo ainda não foi usado", "planos se–então ativos ainda não foram usados") + '. <button class="btn small ghost" data-act="nav" data-v="seentao">Revisar</button></p>' : "") + "</div>" +
    "</div>" +
    '<details class="why"><summary>Por que funciona assim?</summary><p><b>Por que comparar com você mesmo?</b> Acompanhar o próprio progresso aumenta o alcance de metas (Harkin et al., 2016). Comparar com a sua semana anterior mostra se o que você mudou está funcionando.</p></details>' +
    "</section>";
}

/* ---------- SE–ENTÃO ---------- */
const TEMPLATES = [
  ["Começar", "Quando eu sentar à mesa de manhã", "abro o arquivo e escrevo uma frase antes de qualquer outra coisa"],
  ["Distração", "Se eu pegar o celular durante um bloco", "coloco o celular em outro cômodo e volto para a tarefa"],
  ["Travar", "Se eu não souber como continuar um parágrafo", "escrevo a ideia em tópicos e sigo para o próximo"],
  ["Emoção", "Se bater a ansiedade de não dar tempo", "respiro por um minuto e faço só o próximo pomodoro"],
  ["Rotina", "Quando o despertador tocar", "levanto na hora e abro a janela"],
  ["Distração", "Se eu sentir vontade de jogar", "jogo só depois de cumprir a meta do dia"]
];
function usedLast7(p) { const lim = dayKey(addDays(new Date(), -6)); return (p.hist || []).filter(k => k >= lim).length; }
function vSeEntao() {
  const all = state.plans, list = all.filter(p => ui.pFilter === "Todas" || p.cat === ui.pFilter);
  const act = all.filter(p => p.active).length, pin = all.filter(p => p.active && p.pinned).length, u7 = all.reduce((s, p) => s + usedLast7(p), 0);
  const tile = (c, n, l) => '<div class="stat ' + c + '"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>";
  const card = (p, i) => {
    if (ui.pEdit === p.id) {
      return '<div class="pcard"><div class="planrow"><div class="field"><span class="lab">Se / Quando…</span><input type="text" id="pea-' + p.id + '" value="' + esc(p.a) + '" aria-label="Situação"></div><div class="field"><span class="lab">…então eu</span><input type="text" id="peb-' + p.id + '" value="' + esc(p.b) + '" aria-label="Ação"></div>' +
        '<div class="field"><span class="lab">Categoria</span><select id="pec-' + p.id + '" aria-label="Categoria">' + PCATS.map(c => "<option" + (c === p.cat ? " selected" : "") + ">" + c + "</option>").join("") + "</select></div></div>" +
        '<div class="row"><button class="btn primary small" data-act="psave" data-id="' + p.id + '">Salvar</button><button class="btn small ghost" data-act="pcancel">Cancelar</button></div></div>';
    }
    const color = PCAT_COLOR[p.cat] || "lilac";
    return '<div class="pcard' + (p.active ? "" : " paused") + '" style="border-left-color:var(--' + color + '-ink)">' +
      '<div class="row"><span class="chip ' + color + '">' + esc(p.cat) + "</span>" + (!p.active ? '<span class="chip plain">pausado</span>' : (p.pinned ? '<span class="chip">no Hoje</span>' : "")) + "</div>" +
      '<p class="ptext"><b>' + esc(p.a || "…") + ",</b> " + esc(p.b || "…") + ".</p>" +
      '<p class="hint">' + (p.uses ? "Usado " + plural(p.uses, "vez", "vezes") + (p.last ? " · última vez em " + fmtShort(new Date(p.last)) : "") + " · " + usedLast7(p) + " nos últimos 7 dias" : "Ainda não usado") + "</p>" +
      (ui.pDel === p.id ? '<div class="row"><span class="hint">Apagar este plano?</span><button class="btn small danger" data-act="pdelok" data-id="' + p.id + '">Sim, apagar</button><button class="btn small ghost" data-act="pdelcancel">Cancelar</button></div>' :
      '<div class="row">' +
        (p.active ? '<button class="btn small primary" data-act="puse" data-id="' + p.id + '">Usei agora</button>' : '<button class="btn small primary" data-act="pactive" data-id="' + p.id + '">Reativar</button>') +
        '<button class="btn small" data-act="pedit" data-id="' + p.id + '">Editar</button>' +
        '<button class="btn small ghost" data-act="pmenu" data-id="' + p.id + '" aria-expanded="' + (ui.pMenu === p.id) + '">' + (ui.pMenu === p.id ? "Menos opções" : "Mais opções") + "</button>" +
      "</div>" +
      (ui.pMenu === p.id ? '<div class="row more">' +
        (p.active ? '<button class="btn small" data-act="ppin" data-id="' + p.id + '">' + (p.pinned ? "Tirar do Hoje" : "Mostrar no Hoje") + "</button>" : "") +
        (p.active ? '<button class="btn small" data-act="pactive" data-id="' + p.id + '">Pausar</button>' : "") +
        '<button class="btn small" data-act="pmove" data-d="-1" data-id="' + p.id + '"' + (i === 0 ? " disabled" : "") + ">↑ Subir</button>" +
        '<button class="btn small" data-act="pmove" data-d="1" data-id="' + p.id + '"' + (i === all.length - 1 ? " disabled" : "") + ">↓ Descer</button>" +
        '<button class="btn small ghost danger" data-act="pdel" data-id="' + p.id + '">Apagar</button>' +
      "</div>" : "")) +
      "</div>";
  };
  return '<section class="view">' +
    '<div class="head"><div><p class="eyebrow">Decida antes, aja depois</p><h1>Se–então</h1></div></div>' +
    '<p class="lead">Um plano se–então liga uma situação concreta a uma ação exata. Quando a situação aparece, você não precisa decidir nada: só executa.</p>' +
    '<div class="stats">' + tile("lilac", act, "planos ativos") + tile("sky", pin, "em destaque no Hoje") + tile("mint", u7, "usos nos últimos 7 dias") + "</div>" +
    '<div class="panel"><h2>Novo plano</h2>' +
      '<div class="planrow"><div class="field"><label for="pa">Se / Quando…</label><input type="text" id="pa" placeholder="ex.: Se eu pegar o celular durante um bloco"></div><div class="field"><label for="pb">…então eu</label><input type="text" id="pb" placeholder="ex.: coloco o celular em outro cômodo"></div>' +
      '<div class="field"><label for="pcat">Categoria</label><select id="pcat">' + PCATS.map(c => "<option>" + c + "</option>").join("") + "</select></div></div>" +
      '<div class="row" style="justify-content:space-between"><label class="row" style="gap:6px"><input type="checkbox" id="ppin" checked style="width:20px;height:20px"> Mostrar no Hoje</label><button class="btn primary" data-act="pcreate">Criar plano</button></div>' +
      '<div class="sugg"><p class="hint">Modelos para começar (toque para preencher):</p><div class="row">' + TEMPLATES.map((t, i) => '<button class="chip ' + PCAT_COLOR[t[0]] + '" data-act="ptemplate" data-i="' + i + '">' + esc(t[1]) + "…</button>").join("") + "</div></div>" +
    "</div>" +
    '<div class="row" role="group" aria-label="Filtrar por categoria">' + ["Todas"].concat(PCATS).map(c => '<button class="filter" data-act="pfilter" data-v="' + c + '" aria-pressed="' + (ui.pFilter === c) + '">' + c + "</button>").join("") + "</div>" +
    '<div class="plist">' + (list.length ? list.map(p => card(p, all.indexOf(p))).join("") : '<p class="hint">Nenhum plano nesta categoria.</p>') + "</div>" +
    '<details class="why"><summary>Por que funciona assim?</summary><p><b>Por que funciona?</b> Numa meta-análise de 94 testes, planos se–então tiveram efeito médio-grande sobre o alcance de metas (Gollwitzer e Sheeran, 2006). Eles tendem a funcionar melhor quando a situação é bem específica e o plano é ensaiado mentalmente. Marque “Usei agora” para ver quais planos você realmente usa.</p></details>' +
    "</section>";
}

/* ---------- AJUSTES ---------- */
function accountPanel() {
  const u = ctx.user;
  const who = u
    ? '<div class="account">' + (u.picture ? '<img src="' + esc(u.picture) + '" alt="" width="44" height="44" referrerpolicy="no-referrer">' : '<span class="avatar">' + esc((u.name || u.email || "?").slice(0, 1).toUpperCase()) + "</span>") +
      '<div><b>' + esc(u.name || "") + '</b><span class="hint">' + esc(u.email || "") + "</span></div></div>" +
      '<p class="hint">Seus dados ficam no arquivo <code>profoco-data.json</code>, numa pasta oculta do app no seu Google Drive. Só o ProFoco acessa esse arquivo, e ele não aparece na sua lista de arquivos.</p>'
    : '<p class="hint">Você está usando sem conta: os dados ficam só neste aparelho. Entre com o Google para acessar de qualquer lugar. ' + (ui.persisted === true ? "O navegador prometeu não apagar esses dados sozinho." : ui.persisted === false ? "O navegador pode apagar esses dados se faltar espaço: baixe um backup de vez em quando." : "") + "</p>";
  return '<div class="panel"><h2>Conta e dados</h2>' + who +
    '<p class="sync-line"><span class="dot"></span><span id="sync-line">' + esc(syncLine()) + "</span></p>" +
    '<div class="row">' +
      (u ? '<button class="btn primary" data-act="syncnow">Sincronizar agora</button><button class="btn" data-act="signout">Sair</button>' : '<button class="btn primary" data-act="gologin">Entrar com Google</button>') +
      '<button class="btn" data-act="downloadbackup">Baixar backup (arquivo)</button><label class="btn filebtn">Restaurar de arquivo<input type="file" accept=".json,application/json" data-field="importfile" hidden></label>' +
      '<button class="btn" data-act="copybackup">Copiar backup</button><button class="btn" data-act="restoreopen">Restaurar colando texto</button>' +
      (ui.wipe ? '<button class="btn danger" data-act="wipeok">Confirmar: apagar tudo</button><button class="btn ghost" data-act="wipe">Cancelar</button>' : '<button class="btn ghost danger" data-act="wipe">Apagar tudo</button>') +
    "</div>" +
    (ui.restoreOpen ? '<textarea id="restore-t" placeholder="Cole aqui o backup copiado"></textarea><button class="btn primary" data-act="restore" style="justify-self:start">Restaurar</button>' : "") +
    "</div>";
}
function vAjustes() {
  const S = state.settings;
  const num = (k, lab, min, max) => '<div class="field"><label for="s-' + k + '">' + lab + '</label><input id="s-' + k + '" type="number" min="' + min + '" max="' + max + '" data-field="set" data-k="' + k + '" value="' + S[k] + '"></div>';
  return '<section class="view">' +
    '<div class="head"><div><p class="eyebrow">Conta, hábitos e foco</p><h1>Ajustes</h1></div></div>' +
    accountPanel() +
    calendarPanel() +
    supportPanel() +
    '<div class="panel"><h2>Hábitos</h2><p class="hint">Escolha poucos. Hábitos levam em média cerca de dois meses para ficar automáticos, com muita variação entre pessoas (Lally et al., 2010).</p>' +
      '<div class="habs">' + state.habits.map(h => '<div class="habcard" style="--hc:var(--' + h.color + '-ink)">' +
        '<div class="habcard-top"><input type="text" data-field="hname" data-id="' + h.id + '" value="' + esc(h.name) + '" aria-label="Nome do hábito"><button class="btn small ghost danger" data-act="hdel" data-id="' + h.id + '">Remover</button></div>' +
        '<div class="habcard-grid">' +
        '<div class="field"><span class="lab">Cor</span><div class="cpick">' + COLORS.map(c => '<button class="sw" style="background:var(--' + c + ');border-color:var(--' + c + '-ink)" data-act="hcolor" data-id="' + h.id + '" data-c="' + c + '" aria-pressed="' + (h.color === c) + '" aria-label="' + COLOR_NAMES[c] + '" title="' + COLOR_NAMES[c] + '"></button>').join("") + "</div></div>" +
        '<div class="field"><span class="lab">Tipo</span><select data-field="hkind" data-id="' + h.id + '" aria-label="Tipo"><option value="check"' + (h.kind === "check" ? " selected" : "") + '>Feito / não feito</option><option value="count"' + (h.kind === "count" ? " selected" : "") + ">Quantidade</option></select></div>" +
        '<div class="field"><span class="lab">Frequência</span><select data-field="hper" data-id="' + h.id + '" aria-label="Frequência"><option value="day"' + (h.per === "day" ? " selected" : "") + '>Todo dia</option><option value="week"' + (h.per === "week" ? " selected" : "") + ">Vezes por semana</option></select></div>" +
        (h.per === "day" && h.kind === "check" ? "" : '<div class="field"><span class="lab">' + (h.per === "week" ? "Vezes na semana" : "Meta por dia") + '</span><input type="number" min="1" max="999" data-field="hn" data-id="' + h.id + '" value="' + h.n + '" aria-label="Meta"></div>') +
        (h.kind === "count" ? '<div class="field"><span class="lab">Unidade</span><input type="text" data-field="hunit" data-id="' + h.id + '" value="' + esc(h.unit || "") + '" placeholder="ex.: páginas" aria-label="Unidade"></div>' : "") +
        "</div></div>").join("") + "</div>" +
      '<div class="row"><input type="text" class="grow" id="hab-in" placeholder="Novo hábito: ex. meditar 5 minutos" aria-label="Novo hábito"><button class="btn primary" data-act="hadd">Adicionar hábito</button></div></div>' +
    '<div class="panel"><h2>Aparência</h2><p class="hint">Tema e cor de destaque. A escolha vai junto com seus dados e vale em todos os aparelhos.</p>' +
      '<div class="field"><span class="lab">Tema</span><div class="seg" role="group" aria-label="Tema">' + Object.keys(THEME_NAMES).map(t => '<button data-act="theme" data-v="' + t + '" aria-pressed="' + ((THEME_NAMES[S.theme] ? S.theme : "auto") === t) + '">' + THEME_NAMES[t] + "</button>").join("") + "</div></div>" +
      '<div class="field"><span class="lab">Cor de destaque</span><div class="seg" role="group" aria-label="Cor de destaque">' + ACCENTS.map(c => '<button class="sw" style="background:var(--' + c + ');border-color:var(--' + c + '-ink)" data-act="accent" data-v="' + c + '" aria-pressed="' + ((ACCENTS.includes(S.accent) ? S.accent : "lilac") === c) + '" aria-label="' + COLOR_NAMES[c] + '" title="' + COLOR_NAMES[c] + '"></button>').join("") + "</div></div></div>" +
    '<div class="panel"><h2>Foco e rotina</h2><div class="settings">' +
      '<div class="field"><label for="s-wake">Horário fixo de acordar</label><input id="s-wake" type="time" data-field="set" data-k="wake" value="' + esc(S.wake) + '"></div>' +
      num("goal", "Meta diária (pomodoros)", 1, 8) + num("min", "Versão mínima (pomodoros)", 1, 4) + num("focus", "Duração do foco (min)", 10, 50) + num("brk", "Descanso curto (min)", 3, 15) + num("long", "Descanso longo, a cada 4 pomodoros (min)", 5, 60) +
    "</div></div>" +
    '<div class="panel"><h2>Base científica</h2><ul class="refs">' +
      "<li>Steel (2007), meta-análise sobre a natureza da procrastinação.</li>" +
      "<li>Sirois e Pychyl (2013), procrastinação como reparo de humor de curto prazo.</li>" +
      "<li>Boice (1989, 1997), sessões breves e diárias de escrita.</li>" +
      "<li>Gollwitzer e Sheeran (2006), meta-análise de intenções de implementação.</li>" +
      "<li>Bandura e Schunk (1981), metas próximas.</li>" +
      "<li>Lally et al. (2010), formação de hábitos no dia a dia.</li>" +
      "<li>Harkin et al. (2016), meta-análise sobre monitorar o progresso.</li>" +
      "<li>Yang, Huang e Morwitz (2023), agenda com visão ampla e conclusão de tarefas.</li>" +
      "<li>Wohl, Pychyl e Bennett (2010), autoperdão e procrastinação.</li>" +
    "</ul></div></section>";
}

/* ---------- render & routing ---------- */
const VIEWS = { hoje: vHoje, objetivos: vObjetivos, semana: vSemana, perfil: vPerfil, seentao: vSeEntao, ajustes: vAjustes };
const ALIAS = { mapa: "objetivos", planos: "ajustes", revisao: "semana" };
function fitTrees() {
  document.querySelectorAll(".tree-scroll").forEach(sc => {
    const tr = sc.firstElementChild; if (!tr) return;
    tr.style.zoom = 1;
    const need = tr.scrollWidth, have = sc.clientWidth - 8;
    if (need > have) tr.style.zoom = Math.max(0.62, have / need).toFixed(3);
  });
}
window.addEventListener("resize", () => { if (ui.view === "objetivos") fitTrees(); });
function updatePill() {
  const pill = $("#timer-pill"); if (!pill) return;
  const t = ui.timer;
  if (!t) { pill.hidden = true; return; }
  pill.hidden = false;
  pill.classList.toggle("paused", !!t.paused);
  const it = timerItem();
  $("#timer-pill-t").textContent = fmtMs(timeLeft()) + (t.phase === "break" ? (t.long ? " · descanso longo" : " · descanso") : (t.paused ? " · pausado" : ""));
  pill.title = (t.phase === "focus" ? "Foco" : "Descanso") + (it ? ": " + it.title : "") + ". Toque para voltar ao Hoje.";
}
function render() {
  let html = VIEWS[ui.view]();
  if (SUPPORT_VIEWS.includes(ui.view)) html = html.replace(/<\/section>\s*$/, supportLine() + "</section>");
  $("#app").innerHTML = html;
  updatePill();
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-current", b.dataset.v === ui.view ? "page" : "false"));
  if (ui.view === "objetivos") fitTrees();
}
function go(v) {
  const orig = v;
  v = ALIAS[v] || v;
  if (!VIEWS[v]) v = "hoje";
  ui.view = v; ui.pMenu = null;
  try { if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v); } catch (e) {}
  render(); window.scrollTo(0, 0);
  if (orig === "revisao") { const el = $("#rev-sec"); if (el) el.scrollIntoView(); }
  const h1 = $("#app h1"); if (h1) { h1.setAttribute("tabindex", "-1"); try { h1.focus({ preventScroll: true }); } catch (e) {} }
}
window.addEventListener("hashchange", () => { let v = location.hash.slice(1); v = ALIAS[v] || v; if (VIEWS[v] && v !== ui.view) { ui.view = v; render(); } });

function copyText(text) {
  try { navigator.clipboard.writeText(text).then(() => toast("Copiado."), () => fallbackCopy(text)); } catch (e) { fallbackCopy(text); }
}
function fallbackCopy(text) {
  const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
  ta.remove(); toast(ok ? "Copiado." : "Não deu para copiar automaticamente. Selecione o texto e copie.");
}
function addPlanItem(k, title, nodeId, extra, color) {
  title = (title || "").trim(); if (!title) { toast("Escreva a tarefa primeiro."); return null; }
  const p = dayPlan(k), it = { id: uid(), title, done: false, rc: randColor() };
  if (color) it.color = color;
  if (nodeId && node(nodeId)) it.node = nodeId;
  if (extra) it.extra = true;
  p.items.push(it); return it;
}
function focusSoon(sel) { setTimeout(() => { const el = $(sel); if (el) el.focus(); }, 0); }

/* ---------- events ---------- */
document.addEventListener("pointerdown", () => primeAudio(), { passive: true });
/* Objetivos: clicar fora do galho selecionado recolhe as opções (sem perder o que foi digitado em "Novo objetivo" nem a rolagem da árvore). */
document.addEventListener("click", e => {
  if (!state || ui.view !== "objetivos" || !ui.sel) return;
  if (e.target.closest(".node.sel, button, a, input, select, textarea, label, summary, [data-act]")) return;
  const g = $("#goal-in"), typed = g ? g.value : "", scrolls = [...document.querySelectorAll(".tree-scroll")].map(x => x.scrollLeft);
  ui.sel = null; ui.edit = null; ui.branch = null; ui.confirmDel = null;
  render();
  const g2 = $("#goal-in"); if (g2 && typed) g2.value = typed;
  document.querySelectorAll(".tree-scroll").forEach((x, i) => { x.scrollLeft = scrolls[i] || 0; });
});
document.addEventListener("click", e => {
  if (!state) return;
  const b = e.target.closest("[data-act]"); if (!b) return;
  if (b.dataset.act === "selnode" && e.target.closest("button,input,select")) return;
  const a = b.dataset.act, id = b.dataset.id, S = state.settings, tk = todayKey();
  switch (a) {
    case "nav": go(b.dataset.v); break;
    /* planning */
    case "planadd": { const inp = $("#plan-in"), sel = $('[data-field="plannode"][data-for="plan"]'); const it = addPlanItem(tk, inp.value, sel ? sel.value : "", false, ui.newColor); if (!it) break; ui.newPlanNode = ""; ui.newColor = ""; save(); render(); focusSoon("#plan-in"); break; }
    case "planaddnode": { const n = node(id); if (!n) break; addPlanItem(tk, n.title, id); save(); render(); break; }
    case "planaddpend": { const pp = state.days[b.dataset.day]; const src = pp && pp.items.find(x => x.id === id); if (!src) break; const ni = addPlanItem(tk, src.title, src.node, false, src.color); if (ni) ni.rc = src.rc || ni.rc; save(); render(); break; }
    case "planrm": { const p = dayPlan(tk); if (ui.timer && ui.timer.taskId === id) break; p.items = p.items.filter(i => i.id !== id); if (p.next === id) p.next = null; save(); render(); toast("Tarefa removida."); break; }
    case "tedit": ui.editTask = id; render(); focusSoon("#te-" + id); break;
    case "teditcancel": ui.editTask = null; render(); break;
    case "teditok": {
      const it = itemById(id), inp = $("#te-" + id), sel = $("#tm-" + id);
      if (!it || !inp) { ui.editTask = null; render(); break; }
      const v = inp.value.trim(); if (!v) { toast("Escreva o nome da tarefa."); inp.focus(); break; }
      it.title = v;
      if (sel) { if (sel.value && node(sel.value)) it.node = sel.value; else delete it.node; }
      ui.editTask = null; save(); render(); toast("Tarefa atualizada."); break;
    }
    case "treopen": {
      const p = dayPlan(tk), it = p.items.find(i => i.id === id); if (!it || !it.done) break;
      it.done = false; it.doneAt = null; it.paused = false; it.pausedAt = null;
      if (it.nodeDone && it.node && node(it.node)) { node(it.node).done = false; node(it.node).doneAt = null; }
      delete it.nodeDone; p.next = id;
      save(); render(); toast("Tarefa reiniciada. Ela voltou para A fazer."); break;
    }
    case "pmenu": ui.pMenu = ui.pMenu === id ? null : id; render(); break;
    case "itemdone": {
      const p = dayPlan(tk), it = p.items.find(i => i.id === id); if (!it) break;
      it.done = !it.done; it.doneAt = it.done ? Date.now() : null; it.paused = false; it.pausedAt = null;
      if (it.done && ui.timer && ui.timer.taskId === id) abandonTimer();
      if (it.done && p.next === id) { const nx = sortedItems(p).find(i => !i.done && !i.paused); p.next = nx ? nx.id : null; }
      save(); render(); if (it.done) toast("Concluída. Ela foi para o fim da lista."); break;
    }
    case "tstart": {
      const it = itemById(id); if (!it || it.done) break; primeAudio();
      it.paused = false; it.pausedAt = null; dayPlan(tk).next = id;
      if (ui.timer && ui.timer.phase === "focus" && ui.timer.taskId === id) { if (ui.timer.paused) { ui.timer.endAt = Date.now() + ui.timer.left; ui.timer.paused = false; } ui.step = "running"; save(); render(); break; }
      if (ui.timer) abandonTimer();
      save(); startTimer("focus", S.focus, id);
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (err) {}
      break;
    }
    case "tpause": {
      const it = itemById(id); if (!it || it.done) break;
      if (ui.timer && ui.timer.phase === "focus" && ui.timer.taskId === id && !ui.timer.paused) { ui.timer.left = timeLeft(); ui.timer.paused = true; }
      it.paused = true; it.pausedAt = Date.now();
      const p = dayPlan(tk); if (p.next === id) { const nx = sortedItems(p).find(i => !i.done && !i.paused); p.next = nx ? nx.id : null; }
      save(); render(); toast("Pausada. Ela fica entre as tarefas a fazer e as concluídas."); break;
    }
    case "newcolor": { ui.newColor = b.dataset.c; b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); break; }
    case "rootcolor": { const n = node(id); if (n) { n.color = b.dataset.c; save(); render(); } break; }
    case "feel2": { const l = logDay(tk), v = b.dataset.v; l.f = (l.f || []).includes(v) ? l.f.filter(x => x !== v) : (l.f || []).concat(v); save(); b.setAttribute("aria-pressed", String(l.f.includes(v))); break; }
    /* focus */
    case "start": primeAudio(); ui.step = "checkin"; ui.feel = []; ui.swap = false; render(); break;
    case "cancel": ui.step = null; render(); break;
    case "feel": { const v = b.dataset.v; ui.feel = ui.feel.includes(v) ? ui.feel.filter(x => x !== v) : ui.feel.concat(v); b.setAttribute("aria-pressed", ui.feel.includes(v)); break; }
    case "go": { primeAudio(); if (ui.feel.length) { const l = logDay(tk); l.f = Array.from(new Set((l.f || []).concat(ui.feel))); save(); } startTimer("focus", S.focus); break; }
    case "pause": {
      if (!ui.timer) break;
      ui.timer.left = timeLeft(); ui.timer.paused = true;
      const it = timerItem(); if (it && ui.timer.phase === "focus") { it.paused = true; it.pausedAt = Date.now(); save(); }
      render(); break;
    }
    case "resume": {
      if (!ui.timer) break;
      ui.timer.endAt = Date.now() + ui.timer.left; ui.timer.paused = false;
      const it = timerItem(); if (it) { it.paused = false; it.pausedAt = null; save(); }
      render(); break;
    }
    case "stop": finishTimer(true); break;
    case "afteryes": {
      const t = itemById(ui.lastTask) || nextItem();
      if (t) {
        t.done = true; t.paused = false; t.pausedAt = null; t.doneAt = Date.now();
        if (b.dataset.node && t.node && node(t.node) && !node(t.node).done) { node(t.node).done = true; node(t.node).doneAt = Date.now(); t.nodeDone = true; toast("Tarefa e meta concluídas. Um degrau a mais."); }
        else toast("Tarefa concluída.");
        const p = dayPlan(tk); const nx = sortedItems(p).find(i => !i.done && !i.paused); p.next = nx ? nx.id : null; save();
      }
      ui.afterDone = true; render(); break;
    }
    case "afterno": ui.afterDone = false; render(); break;
    case "break": { primeAudio(); ui.afterDone = null; const br = breakInfo(); startTimer("break", br.min, null, br.long); break; }
    case "endday": ui.step = null; ui.afterDone = null; render(); toast("Bom trabalho. Até a próxima sessão."); break;
    case "swap": ui.swap = !ui.swap; render(); break;
    case "setnext": dayPlan(tk).next = id; ui.swap = false; save(); render(); break;
    /* habits */
    case "habit": {
      const l = logDay(tk); l.h[id] = true; save(); render();
      const h = state.habits.find(x => x.id === id);
      toast((h ? h.name : "Hábito") + " feito. Volta amanhã.", "Desfazer", () => { const l2 = logDay(todayKey()); l2.h[id] = false; save(); render(); });
      break;
    }
    case "hadd": { const inp = $("#hab-in"); const name = inp && inp.value.trim(); if (!name) { toast("Dê um nome ao hábito."); break; } const used = state.habits.map(h => h.color); state.habits.push({ id: uid(), name, kind: "check", per: "day", n: 1, color: COLORS.find(c => !used.includes(c)) || "lilac" }); save(); render(); break; }
    case "hdel": state.habits = state.habits.filter(h => h.id !== id); save(); render(); break;
    case "hcolor": { const h = state.habits.find(x => x.id === id); if (h) { h.color = b.dataset.c; save(); render(); } break; }
    /* goals */
    case "selnode": if (ui.sel !== id) { ui.sel = id; ui.edit = null; ui.branch = null; ui.confirmDel = null; render(); } break;
    case "nodedone": { const n = node(id); if (n) { n.done = true; n.doneAt = Date.now(); save(); const r = rootOf(id); render(); toast(!n.parent ? "Objetivo conquistado!" : "Meta concluída."); } break; }
    case "nodeundo": { const n = node(id); if (n) { n.done = false; n.doneAt = null; save(); render(); } break; }
    case "nodetoday": {
      const n = node(id); if (!n) break; const p = dayPlan(tk);
      addPlanItem(tk, n.title, id, false); save(); toast("Adicionada ao plano de hoje."); break;
    }
    case "branch": ui.branch = id; render(); focusSoon("#br-" + id); break;
    case "branchcancel": ui.branch = null; render(); break;
    case "branchok": {
      const v = $("#br-" + id).value.trim(); if (!v) { toast("Escreva o galho."); break; }
      addNode(v, id); ui.branch = null; save(); render(); toast("Galho adicionado."); break;
    }
    case "edit": ui.edit = id; render(); focusSoon("#edit-" + id); break;
    case "editcancel": ui.edit = null; render(); break;
    case "editok": { const v = $("#edit-" + id).value.trim(); if (v) { node(id).title = v; save(); } ui.edit = null; render(); break; }
    case "del": ui.confirmDel = id; render(); break;
    case "delcancel": ui.confirmDel = null; render(); break;
    case "delok": delSubtree(id); ui.confirmDel = null; ui.sel = null; save(); render(); break;
    case "addgoal": { const inp = $("#goal-in"); const t = inp.value.trim(); if (!t) { toast("Escreva o objetivo."); break; } const rid = addNode(t, null); ui.sel = rid; ui.branch = rid; save(); render(); focusSoon("#br-" + rid); break; }
    /* week */
    case "weeknav": { const d = Number(b.dataset.d); ui.weekOff = d === 0 ? 0 : ui.weekOff + d; render(); break; }
    case "revnav": { const d = Number(b.dataset.d); ui.revOff = d === 0 ? 0 : ui.revOff + d; render(); break; }
    case "futadd": { const k = b.dataset.day, inp = $("#fut-" + k); if (!addPlanItem(k, inp.value)) break; save(); render(); focusSoon("#fut-" + k); break; }
    case "futrm": { const p = state.days[b.dataset.day]; if (p && !p.locked) { p.items = p.items.filter(i => i.id !== id); save(); render(); } break; }
    /* review & settings */
    case "level": { S.goal = Math.min(8, Math.max(1, S.goal + Number(b.dataset.d))); if (S.min > S.goal) S.min = S.goal; save(); render(); toast("Nova meta: " + plural(S.goal, "pomodoro") + " por dia útil."); break; }
    case "copymsg": copyText($("#msg").textContent); break;
    case "pcreate": {
      const a1 = $("#pa").value.trim(), b1 = $("#pb").value.trim();
      if (!a1 || !b1) { toast("Preencha a situação e a ação."); break; }
      const p = mkPlan(a1, b1, $("#pcat").value); p.pinned = $("#ppin").checked; state.plans.unshift(p); ui.pFilter = "Todas"; save(); render(); toast("Plano criado."); break;
    }
    case "ptemplate": { const t = TEMPLATES[Number(b.dataset.i)]; if (!t) break; $("#pcat").value = t[0]; $("#pa").value = t[1]; $("#pb").value = t[2]; $("#pb").focus(); break; }
    case "pfilter": ui.pFilter = b.dataset.v; render(); break;
    case "puse": { const p = state.plans.find(x => x.id === id); if (!p) break; p.uses = (p.uses || 0) + 1; p.last = Date.now(); p.hist = (p.hist || []).concat(tk).slice(-120); save(); render(); toast("Registrado. Plano em ação."); break; }
    case "ppin": { const p = state.plans.find(x => x.id === id); if (p) { p.pinned = !p.pinned; save(); render(); } break; }
    case "pactive": { const p = state.plans.find(x => x.id === id); if (p) { p.active = !p.active; save(); render(); } break; }
    case "pedit": ui.pEdit = id; render(); focusSoon("#pea-" + id); break;
    case "pcancel": ui.pEdit = null; render(); break;
    case "psave": { const p = state.plans.find(x => x.id === id); if (!p) break; const a1 = $("#pea-" + id).value.trim(), b1 = $("#peb-" + id).value.trim(); if (!a1 || !b1) { toast("Preencha a situação e a ação."); break; } p.a = a1; p.b = b1; p.cat = $("#pec-" + id).value; ui.pEdit = null; save(); render(); break; }
    case "pmove": { const i = state.plans.findIndex(x => x.id === id), j = i + Number(b.dataset.d); if (i < 0 || j < 0 || j >= state.plans.length) break; const tmp = state.plans[i]; state.plans[i] = state.plans[j]; state.plans[j] = tmp; save(); render(); break; }
    case "pendtoday": {
      const pp = state.days[b.dataset.day], src = pp && pp.items.find(x => x.id === id); if (!src) break;
      const p = dayPlan(tk); addPlanItem(tk, src.title, src.node, false); src.moved = true; save(); render();
      toast("Levada para as tarefas de hoje."); break;
    }
    case "pdel": ui.pDel = id; render(); break;
    case "pdelcancel": ui.pDel = null; render(); break;
    case "pdelok": state.plans = state.plans.filter(p => p.id !== id); ui.pDel = null; save(); render(); break;
    case "calconnect": {
      const retry = ui.cal.status === "scope";
      cal.connect({ hint: ctx.user && ctx.user.email, prompt: retry ? "consent" : "" })
        .then(() => { S.calendar = true; ui.cal.status = "idle"; ui.cal.day = null; save(); render(); toast("Agenda conectada."); return refreshAgenda(); })
        .catch(err => { if (err.code === "cal_scope") ui.cal.status = "scope"; toast(cal.friendlyError(err)); });
      break;
    }
    case "calrefresh": refreshAgenda().then(() => toast("Agenda atualizada.")); break;
    case "caloff": S.calendar = false; cal.disconnect(); ui.cal = { events: [], status: "idle", day: null }; save(); render(); toast("Agenda desconectada deste aparelho."); break;
    case "copypix": copyText(PIX_KEY); toast("Chave Pix copiada. Obrigado pelo apoio!"); break;
    case "copybackup": copyText(JSON.stringify(state)); break;
    case "downloadbackup": {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "profoco-backup-" + todayKey() + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast("Backup baixado. Procure na pasta Downloads."); break;
    }
    case "syncnow": if (ctx.store && ctx.store.syncNow) ctx.store.syncNow(); break;
    case "signout": if (ctx.onSignOut) ctx.onSignOut(); break;
    case "gologin": if (ctx.onSignIn) ctx.onSignIn(); break;
    case "reauth": if (ctx.onReauth) ctx.onReauth(); break;
    case "restoreopen": ui.restoreOpen = !ui.restoreOpen; render(); break;
    case "restore": {
      const ta = $("#restore-t"); if (!ta) break;
      try { state = migrate(JSON.parse(ta.value)); ui.restoreOpen = false; save(); render(); toast("Backup restaurado."); }
      catch (err) { toast("Esse texto não é um backup válido. Copie de novo pelo botão “Copiar backup”."); }
      break;
    }
    case "theme": S.theme = b.dataset.v; save(); applyTheme(); render(); break;
    case "accent": S.accent = b.dataset.v; save(); applyTheme(); render(); break;
    case "wipe": ui.wipe = !ui.wipe; render(); break;
    case "wipeok": { const fresh = defaults(); fresh.goals = { nodes: {}, roots: [] }; state = fresh; ui.wipe = false; save(); render(); toast("Tudo apagado."); break; }
  }
});
document.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("daydetails")) ui.daysOpen = e.target.open; }, true);
document.addEventListener("keydown", e => {
  if (!state) return;
  const t = e.target;
  if (e.key === "Enter" && t.dataset && t.dataset.act === "tedit") { e.preventDefault(); t.click(); return; }
  if (e.key === "Enter" && t.id && t.id.startsWith("te-")) { e.preventDefault(); const ok = document.querySelector('[data-act="teditok"]'); if (ok) ok.click(); return; }
  if (e.key === "Escape" && ui.editTask) { ui.editTask = null; render(); return; }
  if (e.key === "Escape") { if (ui.pMenu || ui.lockConfirm || ui.extraOpen || ui.sel) { ui.pMenu = null; ui.lockConfirm = false; ui.extraOpen = false; ui.sel = null; ui.branch = null; render(); } return; }
  if (e.key === " " && ui.timer && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) && !(t.classList && t.classList.contains("node"))) {
    e.preventDefault(); const b = document.querySelector(ui.timer.paused ? '[data-act="resume"]' : '[data-act="pause"]');
    if (b) b.click(); else {
      const it = ui.timer.phase === "focus" ? timerItem() : null;
      if (ui.timer.paused) { ui.timer.endAt = Date.now() + ui.timer.left; ui.timer.paused = false; if (it) { it.paused = false; it.pausedAt = null; } }
      else { ui.timer.left = timeLeft(); ui.timer.paused = true; if (it) { it.paused = true; it.pausedAt = Date.now(); } }
      if (it) save(); render(); toast(ui.timer.paused ? "Timer pausado." : "Timer retomado.");
    }
    return;
  }
  if ((e.key === "Enter" || e.key === " ") && t.classList && t.classList.contains("node") && t === document.activeElement) { e.preventDefault(); t.click(); return; }
  if (e.key !== "Enter" || t.tagName !== "INPUT") return;
  const map = { "plan-in": '[data-act="planadd"]', "extra-in": '[data-act="extraadd"]', "goal-in": '[data-act="addgoal"]', "hab-in": '[data-act="hadd"]', "pb": '[data-act="pcreate"]' };
  let sel = map[t.id];
  if (!sel && t.id.indexOf("fut-") === 0) sel = '[data-act="futadd"][data-day="' + t.id.slice(4) + '"]';
  if (!sel && t.id.indexOf("edit-") === 0) sel = '[data-act="editok"][data-id="' + t.id.slice(5) + '"]';
  if (!sel && t.id.indexOf("br-") === 0) sel = '[data-act="branchok"][data-id="' + t.id.slice(3) + '"]';
  if (sel) { e.preventDefault(); const b = $(sel); if (b) b.click(); }
});

let inputT = null;
document.addEventListener("input", e => {
  if (!state) return;
  const el = e.target, f = el.dataset && el.dataset.field; if (!f) return;
  const tk = todayKey();
  if (f === "habitnum") { const l = logDay(tk); l.h[el.dataset.id] = Math.max(0, Number(el.value) || 0); }
  else if (f === "plana" || f === "planb") { const p = state.plans.find(x => x.id === el.dataset.id); if (p) p[f === "plana" ? "a" : "b"] = el.value; }
  else if (f === "rev") { const wk = el.dataset.week; state.reviews[wk] = state.reviews[wk] || {}; state.reviews[wk][el.dataset.k] = el.value; }
  else if (f === "hname" || f === "hunit") { const h = state.habits.find(x => x.id === el.dataset.id); if (h) h[f === "hname" ? "name" : "unit"] = el.value; }
  else return;
  clearTimeout(inputT); inputT = setTimeout(save, 500);
});
document.addEventListener("focusin", e => { const el = e.target; if (el.dataset && el.dataset.field === "habitnum" && el.dataset.prev == null) el.dataset.prev = el.value || "0"; });
document.addEventListener("change", e => {
  if (!state) return;
  const el = e.target, f = el.dataset && el.dataset.field; if (!f) return;
  if (f === "importfile") {
    const file = el.files && el.files[0]; el.value = "";
    if (!file) return;
    file.text().then(txt => {
      const data = JSON.parse(txt);
      if (!data || typeof data !== "object" || !data.settings) throw new Error("formato");
      state = migrate(data); save(); render(); toast("Backup restaurado.");
    }).catch(() => toast("Esse arquivo não é um backup do ProFoco."));
    return;
  }
  const S = state.settings;
  if (f === "plannode") { if (el.dataset.for === "plan") ui.newPlanNode = el.value; const inp = $(el.dataset.for === "extra" ? "#extra-in" : "#plan-in"); if (inp && !inp.value.trim() && el.value && node(el.value)) inp.value = node(el.value).title; }
  else if (f === "nextpick") { dayPlan(todayKey()).next = el.value; save(); }
  else if (f === "habitnum") {
    clearTimeout(inputT);
    const h = state.habits.find(x => x.id === el.dataset.id), prev = Number(el.dataset.prev) || 0;
    save(); render();
    if (h && hDone(todayKey(), h) && !(h.per === "day" ? prev >= (h.n || 1) : prev > 0)) toast(h.name + " feito. Volta amanhã.", "Desfazer", () => { logDay(todayKey()).h[h.id] = prev; save(); render(); });
  }
  else if (f === "hkind" || f === "hper" || f === "hn") {
    const h = state.habits.find(x => x.id === el.dataset.id); if (!h) return;
    if (f === "hkind") { h.kind = el.value; if (h.kind === "count" && !h.unit) h.unit = "vezes"; }
    else if (f === "hper") { h.per = el.value; if (h.per === "week" && h.n < 2) h.n = 3; if (h.per === "day" && h.kind === "check") h.n = 1; }
    else h.n = Math.max(1, Math.min(999, Math.round(Number(el.value)) || 1));
    save(); render();
  }
  else if (f === "set") {
    const k = el.dataset.k;
    if (k === "wake") { if (el.value) S.wake = el.value; }
    else {
      const lim = { goal: [1, 8], min: [1, 4], focus: [10, 50], brk: [3, 15], long: [5, 60] }[k];
      let v = Math.round(Number(el.value)); if (!isFinite(v)) v = S[k];
      S[k] = Math.min(lim[1], Math.max(lim[0], v));
      if (S.min > S.goal) S.min = S.goal;
      el.value = S[k];
    }
    save();
  }
  else if (f === "rev" || f === "plana" || f === "planb" || f === "hname" || f === "hunit") { clearTimeout(inputT); save(); }
});

/* Agenda: atualiza a cada 5 minutos e ao voltar para o app. */
setInterval(() => { if (state && state.settings.calendar && !document.hidden) refreshAgenda(); }, 5 * 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && state && state.settings.calendar) refreshAgenda(); });

/* ---------- boot ---------- */
/**
 * Inicia a interface.
 * @param {object} c
 * @param {object} c.store        SyncStore ou LocalStore (save, syncNow)
 * @param {object|null} c.user    { name, email, picture } ou null (modo sem conta)
 * @param {object|null} c.initialState  estado salvo neste aparelho
 * @param {Function} c.onSignIn / c.onSignOut / c.onReauth
 */
export function startApp(c) {
  ctx = c;
  // Pede ao navegador para não apagar os dados do app sozinho quando faltar espaço.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(ok => { ui.persisted = !!ok; }).catch(() => {});
  }
  state = c.initialState ? migrate(clone(c.initialState)) : defaults();
  applyTheme();
  cal.prepare().catch(() => {});
  if (state.settings.calendar) { ui.cal.day = todayKey(); ui.cal.events = cal.loadCache(ui.cal.day); refreshAgenda(); }
  const v = location.hash.slice(1);
  ui.view = VIEWS[ALIAS[v] || v] ? (ALIAS[v] || v) : "hoje";
  render();
  setStatus(ui.syncStatus || (c.user ? "syncing" : "local"));
}
