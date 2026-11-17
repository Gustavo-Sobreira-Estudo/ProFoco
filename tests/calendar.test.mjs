import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEvents, fetchToday } from "../src/calendar.js";

const at = (h, m = 0) => new Date(2026, 10, 17, h, m).toISOString();

test("normaliza: dia inteiro primeiro, depois por horário", () => {
  const out = normalizeEvents([[
    { id: "b", summary: "Reunião", start: { dateTime: at(14) }, end: { dateTime: at(15) } },
    { id: "a", summary: "Feriado", start: { date: "2026-11-17" }, end: { date: "2026-11-18" } },
    { id: "c", summary: "Café", start: { dateTime: at(9) }, end: { dateTime: at(9, 30) } },
  ]]);
  assert.deepEqual(out.map((e) => e.title), ["Feriado", "Café", "Reunião"]);
  assert.equal(out[0].allDay, true);
});

test("ignora cancelados, recusados, local de trabalho e duplicados entre agendas", () => {
  const ev = { id: "x", summary: "Aula", start: { dateTime: at(10) }, end: { dateTime: at(11) } };
  const out = normalizeEvents([
    [ev, { id: "k", status: "cancelled", summary: "Cancelado", start: { dateTime: at(8) }, end: { dateTime: at(9) } }],
    [ev, { id: "d", summary: "Recusado", start: { dateTime: at(12) }, end: { dateTime: at(13) }, attendees: [{ self: true, responseStatus: "declined" }] }],
    [{ id: "w", eventType: "workingLocation", summary: "Casa", start: { date: "2026-11-17" }, end: { date: "2026-11-18" } }],
  ]);
  assert.deepEqual(out.map((e) => e.title), ["Aula"]);
});

test("título vazio e links não https são tratados", () => {
  const [e] = normalizeEvents([[{ id: "z", start: { dateTime: at(7) }, end: { dateTime: at(8) }, htmlLink: "javascript:alert(1)", hangoutLink: "http://x" }]]);
  assert.equal(e.title, "(Sem título)");
  assert.equal(e.link, "");
  assert.equal(e.meet, "");
});

test("fetchToday lê as agendas selecionadas e junta os eventos", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    assert.equal(opts.headers.Authorization, "Bearer tok");
    const json = url.includes("calendarList")
      ? { items: [{ id: "primary", primary: true }, { id: "ocultas@x", selected: false }, { id: "aulas@x", selected: true }] }
      : { items: [{ id: url.includes("aulas") ? "e2" : "e1", summary: url.includes("aulas") ? "Aula" : "Dentista", start: { dateTime: at(url.includes("aulas") ? 8 : 16) }, end: { dateTime: at(17) } }] };
    return { ok: true, status: 200, json: async () => json };
  };
  const out = await fetchToday("tok", { now: new Date(2026, 10, 17, 12), fetchImpl });
  assert.deepEqual(out.map((e) => e.title), ["Aula", "Dentista"]);
  assert.equal(calls.length, 3); // lista + 2 agendas (a não selecionada fica de fora)
});

test("fetchToday sinaliza token expirado", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(fetchToday("tok", { fetchImpl }), (e) => e.code === "auth");
});
