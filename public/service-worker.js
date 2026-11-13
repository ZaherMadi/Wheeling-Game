const CACHE_NAME = 'wheelie-king-v4';
const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/Logo51.png',
    '/wheelie_rider_51.gltf',
    '/graffiti.json',
    '/audio/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await cache.addAll(APP_SHELL);
            const manifestResponse = await cache.match('/audio/manifest.json');
            const manifest = await manifestResponse.json();
            const indexResponse = await cache.match('/index.html');
            const indexHtml = await indexResponse.text();
            const appAssets = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)]
                .map((match) => match[1]);
            if (appAssets.length) await cache.addAll(appAssets);
            const voiceFiles = (manifest.available || []).map((id) =>
                `/audio/${id}.mp3${manifest.hashes && manifest.hashes[id] ? `?v=${manifest.hashes[id]}` : ''}`
            );
            for (let index = 0; index < voiceFiles.length; index += 4) {
                await cache.addAll(voiceFiles.slice(index, index + 4));
            }
            await self.skipWaiting();
        })()
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(async (response) => {
                    if (response.ok) {
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put(request, response.clone());
                    }
                    return response;
                })
                .catch(async () => (await caches.match(request)) || caches.match('/'))
        );
        return;
    }

    if (url.pathname === '/audio/manifest.json') {
        event.respondWith(
            fetch(request)
                .then(async (response) => {
                    if (response.ok) {
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put(request, response.clone());
                    }
                    return response;
                })
                .catch(async () => caches.match(request))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(async (cached) => {
            if (cached) return cached;
            const response = await fetch(request);
            if (response.ok && /\.(?:js|css|gltf|json|png|jpg|webp|ico|mp3)$/i.test(url.pathname)) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(request, response.clone());
            }
            return response;
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(async (cacheNames) => {
            await Promise.all(cacheNames
                .filter((cacheName) => cacheName !== CACHE_NAME)
                .map((cacheName) => caches.delete(cacheName)));
            await self.clients.claim();
        })
    );
});
