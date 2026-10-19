'use strict';

const APP_CACHE = 'quran-reader-shell-v32';
const AUDIO_CACHE = 'quran-recitation-audio-v1';
const APP_SHELL = [
    './', './index.html', './quran.html', './recitations.html', './library.html', './adhkar.html', './licenses.html',
    './style.css', './home.css', './home.js', './welcome.css', './welcome-boot.js', './welcome.js', './onboarding.css', './onboarding.js', './reader-enhancements.css', './audio-player.css', './recitations.css',
    './recitations-overrides.css', './unified-nav.css', './global-theme.js', './library.css', './adhkar.css', './legal.css',
    './service-worker-register.js', './app.js', './reader-enhancements.js', './reader-layout-polish.js',
    './mushaf-layout-prewarm-worker.js',
    './verse-actions.js', './tafsir.js', './quran-search.js', './verse-tools.js',
    './audio-core.js', './audio-downloads.js', './data/qud/registry.js', './qud-audio.js', './offline-reciter-catalog.js',
    './audio-bulk-download.js', './mushaf-audio.js', './recitations.js', './recitations-library-link.js', './library.js', './adhkar.js',
    './data/quran-uthmani.txt', './data/mushaf-layout.json', './data/adhkar.json', './data/adhkar-source.json',
    './scripts/tafsir_muyassar.json', './assets/fonts/amiri-quran-arabic-400-normal.woff2'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(APP_CACHE).then(async cache => {
        await cache.addAll(APP_SHELL);
        await self.skipWaiting();
    }));
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key =>
            key.startsWith('quran-reader-shell-') && key !== APP_CACHE
        ).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const isAudio = request.destination === 'audio' || /\.mp3(?:$|\?)/i.test(request.url);
    if (isAudio) {
        event.respondWith(caches.open(AUDIO_CACHE).then(async cache => {
            const saved = await cache.match(request.url, { ignoreVary: true });
            if (saved) {
                const range = request.headers.get('range');
                if (range && saved.type !== 'opaque') {
                    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
                    if (match) {
                        const bytes = await saved.arrayBuffer();
                        const start = Number(match[1]);
                        const end = match[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
                        if (start <= end && start < bytes.byteLength) {
                            return new Response(bytes.slice(start, end + 1), {
                                status: 206,
                                headers: {
                                    'Content-Type': saved.headers.get('content-type') || 'audio/mpeg',
                                    'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}`,
                                    'Content-Length': String(end - start + 1),
                                    'Accept-Ranges': 'bytes'
                                }
                            });
                        }
                    }
                }
                return saved;
            }
            return fetch(request);
        }));
        return;
    }
    if (new URL(request.url).origin !== self.location.origin) return;
    event.respondWith(fetch(request).then(response => {
        if (response.ok) caches.open(APP_CACHE).then(cache => cache.put(request, response.clone()));
        return response;
    }).catch(() => caches.match(request)));
});
