const CACHE_NAME = 'pmb-v3d';
const ASSETS = [
  '/index.html',
  '/dashboard.html',
  '/editor.html',
  '/viewer.html',
  '/supabase-config.js',
  '/editor-supabase.js',
  '/mobile.css',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Supabase API / YouTube 등 외부 요청은 캐시 안 함
  if (e.request.url.includes('supabase.co') ||
      e.request.url.includes('youtube.com') ||
      e.request.url.includes('googleapis.com') ||
      e.request.url.includes('cdn.jsdelivr.net')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(response) {
        return caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, response.clone());
          return response;
        });
      });
    }).catch(function() {
      return caches.match('/index.html');
    })
  );
});
