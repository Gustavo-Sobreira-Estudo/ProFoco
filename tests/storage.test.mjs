// Testes da sincronização com o Drive (sem rede: Drive e localStorage simulados).
// Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, SyncStore, LocalStore } from "../src/storage.js";

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function fakeDrive(initial) {
  const files = new Map();
  let n = 0;
  if (initial) files.set("f0", { name: "profoco-data.json", data: initial });
  return {
    files,
    calls: [],
    async findFile(_t, name) { this.calls.push("find"); for (const [id, f] of files) if (f.name === name) return { id }; return null; },
    async download(_t, id) { this.calls.push("download"); if (!files.has(id)) { const e = new Error("not found"); e.status = 404; throw e; } return structuredClone(files.get(id).data); },
    async createFile(_t, name, data) { this.calls.push("create"); const id = "f" + ++n; files.set(id, { name, data: structuredClone(data) }); return { id }; },
    async updateFile(_t, id, data) { this.calls.push("update"); files.get(id).data = structuredClone(data); return { id }; },
  };
}
const mk = (drive, extra = {}) => {
  const statuses = [], remotes = [];
  const store = new SyncStore({ userKey: "u1", fileName: "profoco-data.json", getToken: () => "tok", onStatus: (s) => statuses.push(s), onRemote: (r) => remotes.push(r), drive, storage: memStorage(), debounceMs: 5, ...extra });
  return { store, statuses, remotes };
};

test("decide: mais novo vence", () => {
  assert.equal(decide({ updatedAt: 2 }, { updatedAt: 1 }), "push");
  assert.equal(decide({ updatedAt: 1 }, { updatedAt: 2 }), "pull");
  assert.equal(decide({ updatedAt: 1 }, { updatedAt: 1 }), "same");
  assert.equal(decide({ updatedAt: 1 }, null), "push");
  assert.equal(decide(null, { updatedAt: 1 }), "pull");
});

test("primeiro acesso cria o arquivo no Drive", async () => {
  const drive = fakeDrive();
  const { store, statuses } = mk(drive);
  await store.start({ updatedAt: 10, v: 2 });
  assert.deepEqual(drive.calls, ["find", "create"]);
  assert.equal([...drive.files.values()][0].data.updatedAt, 10);
  assert.equal(statuses.at(-1), "synced");
});

test("Drive mais novo (outro aparelho) substitui o local", async () => {
  const drive = fakeDrive({ updatedAt: 50, v: 2, marca: "tablet" });
  const { store, remotes } = mk(drive);
  await store.start({ updatedAt: 10, v: 2 });
  assert.equal(remotes.length, 1);
  assert.equal(remotes[0].marca, "tablet");
  assert.equal(store.loadLocal().marca, "tablet");
});

test("local mais novo é enviado ao Drive", async () => {
  const drive = fakeDrive({ updatedAt: 5, v: 2 });
  const { store, remotes } = mk(drive);
  await store.start({ updatedAt: 99, v: 2 });
  assert.equal(remotes.length, 0);
  assert.equal(drive.files.get("f0").data.updatedAt, 99);
});

test("save grava no aparelho na hora e no Drive depois da pausa", async () => {
  const drive = fakeDrive();
  const { store } = mk(drive);
  await store.start({ updatedAt: 1, v: 2 });
  store.save({ updatedAt: 2, v: 2, x: 1 });
  assert.equal(store.loadLocal().x, 1);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal([...drive.files.values()][0].data.x, 1);
});

test("sem token: fica pendente e pede reconexão", async () => {
  const drive = fakeDrive();
  const { store, statuses } = mk(drive, { getToken: () => null });
  await store.start({ updatedAt: 1 });
  assert.equal(statuses.at(-1), "reauth");
  assert.equal(drive.calls.length, 0);
});

test("token expirado no meio (401) pede reconexão", async () => {
  const drive = fakeDrive();
  drive.findFile = async () => { const e = new Error("Invalid Credentials"); e.status = 401; throw e; };
  const { store, statuses } = mk(drive);
  await store.start({ updatedAt: 1 });
  assert.equal(statuses.at(-1), "reauth");
});

test("arquivo apagado no Drive é recriado", async () => {
  const drive = fakeDrive({ updatedAt: 1 });
  const { store } = mk(drive);
  await store.start({ updatedAt: 2 });
  drive.files.clear();
  store.save({ updatedAt: 3 });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal([...drive.files.values()][0].data.updatedAt, 3);
});

test("LocalStore guarda só no aparelho", async () => {
  const st = memStorage(), s = [];
  const ls = new LocalStore({ storage: st, onStatus: (x) => s.push(x) });
  ls.save({ a: 1 });
  assert.equal(ls.loadLocal().a, 1);
  assert.equal(s.at(-1), "local");
});
