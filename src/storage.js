// Persistência do ProFoco.
// - LocalStore: só neste aparelho (modo sem conta).
// - SyncStore: cache local + arquivo JSON na appDataFolder do Google Drive.
//   Funciona offline (salva no aparelho) e envia ao Drive quando possível.
//   Conflitos: vence o estado com maior `updatedAt` (último a salvar).
import * as defaultDrive from "./drive.js";

/** Decide o que fazer comparando o estado local com o do Drive. */
export function decide(local, remote) {
  if (!remote) return "push";
  if (!local) return "pull";
  const l = Number(local.updatedAt) || 0, r = Number(remote.updatedAt) || 0;
  if (r > l) return "pull";
  if (r < l) return "push";
  return "same";
}

function readJSON(storage, key) {
  try { const raw = storage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function writeJSON(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}
const hhmm = (ts) => { const d = new Date(ts); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

export class LocalStore {
  constructor({ key = "profoco:data:local", onStatus = () => {}, storage = globalThis.localStorage } = {}) {
    this.key = key; this.onStatus = onStatus; this.storage = storage;
  }
  loadLocal() { return readJSON(this.storage, this.key); }
  save(state) { writeJSON(this.storage, this.key, state); this.onStatus("local"); }
  async start() { this.onStatus("local"); }
  async syncNow() { this.onStatus("local"); }
}

export class SyncStore {
  /**
   * @param {object} o
   * @param {string} o.userKey      id estável do usuário Google (sub)
   * @param {string} o.fileName     nome do arquivo no Drive
   * @param {() => string|null} o.getToken
   * @param {(status:string, detail?:string) => void} o.onStatus
   * @param {(state:object) => void} o.onRemote   chamado quando o Drive tem dados mais novos
   */
  constructor({ userKey, fileName, getToken, onStatus = () => {}, onRemote = () => {}, drive = defaultDrive, storage = globalThis.localStorage, debounceMs = 1500 }) {
    this.key = "profoco:data:" + userKey;
    this.fileKey = "profoco:fileid:" + userKey;
    this.fileName = fileName; this.getToken = getToken;
    this.onStatus = onStatus; this.onRemote = onRemote;
    this.drive = drive; this.storage = storage; this.debounceMs = debounceMs;
    this.current = null; this.dirty = false; this.busy = false; this.again = false; this.timer = null;
    this.fileId = (storage && storage.getItem(this.fileKey)) || null;
    this.lastSync = 0;
  }

  loadLocal() { return readJSON(this.storage, this.key); }

  status(s, detail) { this.lastStatus = s; this.onStatus(s, detail); }

  /** Chamado pelo app a cada mudança. Grava no aparelho na hora e no Drive depois de uma pausa. */
  save(state) {
    this.current = state;
    writeJSON(this.storage, this.key, state);
    this.dirty = true;
    this.status("pending");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), this.debounceMs);
  }

  /** Primeira sincronização após entrar. */
  async start(state) {
    this.current = state;
    return this.sync();
  }

  syncNow() { clearTimeout(this.timer); return this.sync(); }

  /** Baixa, compara e envia o que for preciso. Seguro de chamar várias vezes. */
  async sync() {
    if (this.busy) { this.again = true; return; }
    const token = this.getToken();
    if (!token) { this.status("reauth"); return; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { this.status("offline"); return; }
    this.busy = true;
    this.status("syncing");
    try {
      let id = this.fileId;
      let remote = null;
      if (id) {
        try { remote = await this.drive.download(token, id); }
        catch (e) { if (e.status === 404) { id = null; this.setFileId(null); } else throw e; }
      }
      if (!id) {
        const f = await this.drive.findFile(token, this.fileName);
        if (f) { id = f.id; this.setFileId(id); remote = await this.drive.download(token, id); }
      }
      const action = decide(this.current, remote);
      if (!id) {
        const f = await this.drive.createFile(token, this.fileName, this.current);
        this.setFileId(f.id);
      } else if (action === "pull") {
        this.current = remote;
        writeJSON(this.storage, this.key, remote);
        this.onRemote(remote);
      } else if (action === "push") {
        await this.drive.updateFile(token, id, this.current);
      }
      this.dirty = false;
      this.lastSync = Date.now();
      this.status("synced", "às " + hhmm(this.lastSync));
    } catch (e) {
      if (e.status === 401 || (e.status === 403 && /auth|scope|permission|insufficient/i.test(e.message))) this.status("reauth");
      else if (typeof navigator !== "undefined" && navigator.onLine === false) this.status("offline");
      else this.status("error", e.message);
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.sync(); }
    }
  }

  setFileId(id) {
    this.fileId = id;
    try { if (id) this.storage.setItem(this.fileKey, id); else this.storage.removeItem(this.fileKey); } catch (e) { /* ignore */ }
  }

  /** Mantém os aparelhos em dia: ao voltar para o app, ao reconectar e a cada 2 minutos. */
  watch() {
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => this.sync());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") this.sync(); });
    setInterval(() => { if (document.visibilityState === "visible" && !this.dirty) this.sync(); }, 120000);
  }
}
