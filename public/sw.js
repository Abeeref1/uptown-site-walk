// Site walk service worker: opens offline, keeps the app shell, project data and photos on the phone.
const V = 'sw-v4';
const SHELL = ['./', 'mace.png', 'dmcc.png', 'icon.png', 'icon-192.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const put = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const c = res.clone(); caches.open(V).then(x => x.put(req, c)); } return res; };
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url), same = u.origin === location.origin;
  if (same && u.pathname.includes('/api/')) {
    if (/\/api\/(data|me|names)$/.test(u.pathname)) e.respondWith(fetch(r).then(res => put(r, res)).catch(() => caches.match(r).then(m => m || Response.error())));
    return;
  }
  if (same && u.pathname.includes('/_blob/')) { e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => put(r, res)))); return; }
  if (r.mode === 'navigate') { e.respondWith(fetch(r).then(res => put('./', res)).catch(() => caches.match('./'))); return; }
  if (same || /(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.host))
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => put(r, res))));
});
