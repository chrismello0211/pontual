/* Pontual — service worker
   • abre o app sem internet (a página fica guardada no aparelho);
   • quando há internet, a página vem sempre da rede (atualizações chegam sozinhas);
   • Firebase e APIs do Google nunca passam por aqui: login e sincronização vão direto à rede;
   • mostra os avisos de lembrete e abre o app quando a pessoa toca neles. */
const CORE = 'pontual-core-v4';
const FONT = 'pontual-fonts-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    // um a um: se faltar um arquivo (ex.: ícone), o app ainda instala
    await Promise.allSettled(SHELL.map(u => c.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CORE && k !== FONT) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function pageFirst(req){
  const cache = await caches.open(CORE);
  const net = fetch(req).then(r => { if (r && r.ok) cache.put('index.html', r.clone()); return r; });
  net.catch(() => {});
  try {
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), 3500))]);
  } catch (err) {
    const hit = (await cache.match('index.html')) || (await cache.match('./'));
    return hit || net;
  }
}
async function swr(req){
  const cache = await caches.open(CORE);
  const hit = await cache.match(req);
  const net = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function fonts(req){
  const cache = await caches.open(FONT);
  const hit = await cache.match(req);
  const fresh = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await fresh) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.cache === 'no-store' || req.cache === 'reload') return;       // checagem de versão: direto na rede
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(fonts(req));
    return;                                                              // Firebase, identitytoolkit, securetoken…
  }
  if (req.mode === 'navigate') e.respondWith(pageFirst(req));
  else e.respondWith(swr(req));
});

/* push vindo do servidor (função enviarLembretes): sempre mostra um aviso (o iPhone exige) */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Pontual', {
    body: d.body || '', tag: d.tag || 'pontual', icon: 'icon-192.png', badge: 'icon-192.png', renotify: true,
    data: { url: d.url || './?acao=registrar' }
  }));
});

/* toque no aviso: foca o app (ou abre) e pede para registrar */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); c.postMessage({ tipo: 'acao', acao: 'registrar' }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
