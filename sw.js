const CACHE_NAME = 'hubi-tracker-v38';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './pet.css',
    './i18n.js',
    './qrcodegen.js',
    './qr.js',
    './messages.js',
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
            return Promise.all(
                ASSETS_TO_CACHE.map(async (asset) => {
                    try {
                        const request = new Request(asset, { cache: 'reload' }); // bypass HTTP cache to prevent 206 from disk cache
                        const response = await fetch(request);
                        if (response.status === 200) {
                            await cache.put(asset, response);
                        } else {
                            console.warn(`[Service Worker] Not caching ${asset} (status: ${response.status})`);
                        }
                    } catch (error) {
                        console.error(`[Service Worker] Failed to cache ${asset}:`, error);
                    }
                })
            );
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
    // Bypass cache for media requests that require a Range (Safari/iOS audio fix)
    if (event.request.headers.get('range')) {
        event.respondWith(fetch(event.request));
        return;
    }

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
