// Service worker do ProFoco: deixa o app abrir offline (instalável como PWA).
// Ao mudar qualquer arquivo do app, aumente CACHE para forçar a atualização.
const CACHE = "profoco-v5";
const SHELL = [
  "./",
  "./index.html",
  "./privacidade.html",
  "./manifest.webmanifest",
  "./src/styles.css",
  "./src/main.js",
  "./src/app.js",
  "./src/auth.js",
  "./src/drive.js",
  "./src/storage.js",
  "./src/config.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Arquivos do app: rede primeiro (pega atualizações), cache se estiver offline.
// Chamadas ao Google (login e Drive) nunca passam pelo cache.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
