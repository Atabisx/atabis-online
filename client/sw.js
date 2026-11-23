// ATABİS ONLINE servis çalışanı: uygulama gibi kurulabilmesi ve modellerin telefonda saklanması için.
// Oyun kodu (html/js/css/json) her zaman önce sunucudan istenir, böylece güncellemeler hemen gelir;
// ağ yoksa son kopya kullanılır. 3D modeller ve resimler bir kez indirilip saklanır.
const VERSION = 'atabis-v1';
const ASSETS = /\.(glb|gz|png|jpg|jpeg|webp|woff2?|wav)$/i;

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;   // oyun bağlantısı önbelleğe girmez
  if (/\.mp3$/i.test(url.pathname)) return;   // müzik parça parça (Range) iner, tarayıcının kendi önbelleği yeter
  if (url.origin === location.origin && ASSETS.test(url.pathname)) {
    // önce önbellek (modeller büyük, bir kez inmesi yeter)
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net') {
    // önce ağ, olmazsa önbellek
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await c.match(req);
        if (hit) return hit;
        throw err;
      }
    })());
  }
});
