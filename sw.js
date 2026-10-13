'use strict';

const APP_CACHE = 'quran-reader-shell-v2';
const AUDIO_CACHE = 'quran-recitation-audio-v1';
const APP_SHELL = [
    './', './index.html', './quran.html', './recitations.html',
    './style.css', './reader-enhancements.css', './audio-player.css', './recitations.css',
    './app.js', './reader-enhancements.js', './reader-layout-polish.js',
    './verse-actions.js', './tafsir.js', './verse-tools.js',
    './audio-core.js', './audio-downloads.js', './mushaf-audio.js', './recitations.js',
    './data/quran-uthmani.txt', './data/mushaf-layout.json',
    './scripts/tafsir_muyassar.json', './assets/fonts/amiri-quran-arabic-400-normal.woff2'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(APP_CACHE).then(async cache => {
        await cache.addAll(APP_SHELL);
        // The starter audio is a package asset, not an optional online download.
        // Cache it for browser/PWA use; if a deployment has not bundled it yet,
        // don't break the offline Quran text and tafsir installation.
        await cache.add('./assets/audio/starter-fatiha.ogg').catch(() => {});
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
