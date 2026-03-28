const CACHE_NAME = 'hubi-tracker-v31';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './pet.css',
    './i18n.js',
    './qrcodegen.js',
    './qr.js',
    './app.js',
    './sync.js',
    './pet.js',
    './manifest.json',
    './assets/hubi.png',
    './assets/favicon.svg',
    './assets/meow1.mp3',
    './assets/meow2.mp3',
    './assets/meow3.mp3',
    './assets/fonts/nunito-latin.woff2',
    './assets/fonts/nunito-latin-ext.woff2'
];

// Install — cache all static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch — serve from cache, fallback to network (no dynamic caching)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request);
        }).catch(() => {
            // Offline fallback
            return caches.match('./index.html');
        })
    );
});
