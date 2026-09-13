const CACHE_NAME = 'kita-tabung-shell-v15-13-auto-account';
const STATIC_SHELL = [
  './', './index.html', './app.html', './privacy.html', './terms.html', './help.html', './data-delete.html',
  './assets/app.css', './assets/upgrade-v15.css', './assets/legal.css', './assets/footer-cinematic.webp', './assets/js/error-monitor.js', './assets/js/app.js', './assets/js/upgrade-v15.js', './assets/js/record-input-v15-13.js', './kt.png', './kt-sidebar.png', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // Never cache API responses.

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache:'no-store' }).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(async () => {
      return (await caches.match(event.request)) || (await caches.match('./index.html'));
    }));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && ['style','script','image','font'].includes(event.request.destination)) {
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
    }
    return response;
  })));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
    for (const client of list) if ('focus' in client) return client.focus();
    return clients.openWindow(event.notification.data?.url || './app.html');
  }));
});
