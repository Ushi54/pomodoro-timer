// オフラインでも開けるようにするService Worker。
// 常にネットの最新版を優先し、つながらない時だけ保存しておいた版を使う。
const CACHE = 'pomodoro-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        fetch(e.request)
            .then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(e.request, copy));
                return res;
            })
            .catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
});
