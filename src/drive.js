// Acesso mínimo à API do Google Drive v3 (REST + fetch, sem bibliotecas).
// Tudo acontece na appDataFolder: uma pasta oculta, exclusiva do app, dentro do Drive do usuário.
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export class DriveError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function req(token, url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + token, ...(opts.headers || {}) } });
  if (!r.ok) {
    let detail = "";
    try { const j = await r.json(); detail = j.error && j.error.message ? j.error.message : ""; } catch (e) { /* sem corpo */ }
    throw new DriveError(detail || "Drive respondeu " + r.status, r.status);
  }
  return r;
}

/** Procura o arquivo pelo nome na appDataFolder. Devolve { id, modifiedTime } ou null. */
export async function findFile(token, name) {
  const q = encodeURIComponent("name = '" + name.replace(/'/g, "\\'") + "' and trashed = false");
  const r = await req(token, API + "/files?spaces=appDataFolder&q=" + q + "&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=10");
  const j = await r.json();
  return (j.files && j.files[0]) || null;
}

export async function download(token, id) {
  const r = await req(token, API + "/files/" + encodeURIComponent(id) + "?alt=media");
  const text = await r.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { throw new DriveError("O arquivo de dados no Drive está corrompido.", 422); }
}

export async function createFile(token, name, data) {
  const boundary = "profoco" + Math.random().toString(36).slice(2);
  const meta = { name, parents: ["appDataFolder"], mimeType: "application/json" };
  const body =
    "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n" +
    "--" + boundary + "\r\nContent-Type: application/json\r\n\r\n" + JSON.stringify(data) + "\r\n" +
    "--" + boundary + "--";
  const r = await req(token, UPLOAD + "/files?uploadType=multipart&fields=id,modifiedTime", {
    method: "POST",
    headers: { "Content-Type": "multipart/related; boundary=" + boundary },
    body,
  });
  return r.json();
}

export async function updateFile(token, id, data) {
  const r = await req(token, UPLOAD + "/files/" + encodeURIComponent(id) + "?uploadType=media&fields=id,modifiedTime", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return r.json();
}
