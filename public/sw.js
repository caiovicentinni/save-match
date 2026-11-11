// Service Worker: cache do "app shell" para abrir rápido e funcionar como app instalado
const CACHE = 'save-match-v3';
const SHELL = ['/', '/styles.css', '/app.js', '/img/logo.svg', '/img/logo-white.svg', '/img/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
  // network-first: sempre tenta a versão mais nova, cai no cache se estiver offline
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && url.origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('/')))
  );
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    const target = e.notification.data?.url || '/';
    for (const c of list) { c.focus(); c.navigate?.(target); return; }
    return self.clients.openWindow(target);
  }));
});
