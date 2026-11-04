// Giữ ảnh bản đồ trong bộ nhớ trình duyệt: ảnh là dữ liệu cố định, chỉ tải lại khi đổi phiên bản (tham số ?v= trong URL).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || !u.pathname.startsWith('/tiles/') || e.request.method !== 'GET') return;
  const name = 'tiles-v' + (u.searchParams.get('v') || '0');
  e.respondWith((async () => {
    const cache = await caches.open(name), hit = await cache.match(e.request);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) {
      cache.put(e.request, res.clone());
      caches.keys().then((ks) => ks.filter((k) => k.startsWith('tiles-v') && k !== name).forEach((k) => caches.delete(k)));   // phiên bản cũ: xóa
    }
    return res;
  })());
});
