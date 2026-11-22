const CACHE_NAME = 'phuket-pwa-cache-v18';
const ASSETS = ["./data/live-rates.json","./js/rate-parsers.js","./js/rate-seed.js","./","./index.html","./css/styles.css","./manifest.webmanifest","./js/config.js","./js/utils.js","./js/sync.js","./js/chat-users.js","./js/auth-admin.js","./js/calendar.js","./js/checklist.js","./js/budget-exchange.js","./js/tides-weather.js","./js/app.js"];
const SDK_ASSETS = ["https://telegram.org/js/telegram-web-app.js", "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js", "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js", "https://unpkg.com/mqtt@5.3.4/dist/mqtt.min.js"];
async function prepareCache() {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS.map(url => new Request(url, {cache: 'reload'})));
    await Promise.all(SDK_ASSETS.map(async url => {
        const response = await fetch(new Request(url, {mode: 'no-cors'}));
        if (!response.ok && response.type !== 'opaque') throw new Error('SDK unavailable');
        await cache.put(url, response);
    }));
}
self.addEventListener('install', event => {
    event.waitUntil(prepareCache().then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) {
            if (key.startsWith('phuket-pwa-cache-') && key !== CACHE_NAME) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});
self.addEventListener('message', event => {
    if (event.data?.type !== 'PREPARE_OFFLINE') return;
    event.waitUntil(prepareCache().then(
        () => event.ports[0]?.postMessage({ok: true}),
        error => event.ports[0]?.postMessage({ok: false, error: String(error)})
    ));
});
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    const asset = ASSETS.some(path => new URL(path, self.registration.scope).href === url.origin + url.pathname);
    if (!asset && !SDK_ASSETS.includes(url.href) && event.request.mode !== 'navigate') return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request, {ignoreSearch: asset});
        if (url.pathname.endsWith('/data/live-rates.json')) {
            try { const fresh = await fetch(event.request); if (fresh.ok) { await cache.put(event.request, fresh.clone()); return fresh; } } catch {}
        }
        if (cached) return cached;
        if (event.request.mode === 'navigate' && url.href.startsWith(self.registration.scope)) {
            const page = await cache.match('./index.html');
            if (page) return page;
        }
        return fetch(event.request);
    })());
});
