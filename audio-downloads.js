(() => {
    'use strict';

    const CACHE_NAME = 'quran-recitation-audio-v1';
    const INDEX_KEY = 'quranAudioDownloadsV1';

    function readIndex() {
        try {
            const data = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
            return Array.isArray(data) ? data.filter(item => item && typeof item.url === 'string') : [];
        } catch (_) { return []; }
    }

    function writeIndex(items) {
        try { localStorage.setItem(INDEX_KEY, JSON.stringify(items)); return true; }
        catch (_) { return false; }
    }

    function humanSize(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return 'حجم غير معروف';
        if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
        return `${(bytes / 1024 / 1024).toFixed(1)} ميجابايت`;
    }

    class DownloadManager extends EventTarget {
        constructor(fetcher = (...args) => fetch(...args)) {
            super();
            this.fetcher = fetcher;
            this.active = false;
        }

        supported() {
            return typeof caches !== 'undefined' && typeof Request !== 'undefined';
        }

        list() { return readIndex().sort((a, b) => b.savedAt - a.savedAt); }

        emit(detail) {
            this.dispatchEvent(new CustomEvent('change', { detail: { ...detail, items: this.list() } }));
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('quran-downloads:change'));
        }

        async estimate() {
            if (!navigator.storage?.estimate) return null;
            try { return await navigator.storage.estimate(); } catch (_) { return null; }
        }

        async has(url) {
            if (!this.supported() || !url) return false;
            const cache = await caches.open(CACHE_NAME);
            return !!(await cache.match(url, { ignoreVary: true }));
        }

        async downloadTrack(track) {
            if (!this.supported()) throw new Error('التنزيل غير مدعوم في هذا المتصفح.');
            if (this.active) throw new Error('يوجد تنزيل آخر قيد التنفيذ.');
            if (!track?.url || !/^https:\/\//.test(track.url)) throw new Error('رابط التسجيل غير صالح.');
            this.active = true;
            this.emit({ status: 'starting', track, progress: 0 });
            try {
                const estimate = await this.estimate();
                if (estimate && estimate.quota - estimate.usage < 12 * 1024 * 1024) {
                    throw new Error('المساحة المتاحة منخفضة. احذف تنزيلًا قديمًا ثم حاول مجددًا.');
                }
                const response = await this.fetcher(track.url, { mode: 'cors', cache: 'no-store' });
                if (!response.ok) throw new Error(`تعذّر تنزيل التسجيل (${response.status}).`);
                const expected = Number(response.headers.get('content-length')) || 0;
                let bytes = expected;
                if (estimate && expected && estimate.quota - estimate.usage < expected + 5 * 1024 * 1024) {
                    throw new Error('لا توجد مساحة كافية لهذا التسجيل. احذف تنزيلًا قديمًا ثم حاول مجددًا.');
                }
                const cache = await caches.open(CACHE_NAME);
                if (response.body && typeof ReadableStream !== 'undefined') {
                    // Tee the network stream so Cache Storage writes it directly without
                    // holding a long surah recording in Android WebView memory.
                    const [cacheStream, progressStream] = response.body.tee();
                    const storedResponse = new Response(cacheStream, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                    const cacheWrite = cache.put(track.url, storedResponse);
                    const reader = progressStream.getReader();
                    let received = 0;
                    while (true) {
                        const result = await reader.read();
                        if (result.done) break;
                        received += result.value.byteLength;
                        this.emit({
                            status: 'downloading', track, received, total: expected,
                            progress: expected ? received / expected : 0
                        });
                    }
                    bytes = received;
                    await cacheWrite;
                } else {
                    await cache.put(track.url, response);
                }
                const items = readIndex().filter(item => item.url !== track.url);
                items.push({
                    url: track.url, provider: track.provider, reciterId: track.reciterId,
                    reciterName: track.reciterName, surah: track.surah,
                    surahName: track.surahName, moshafId: track.moshafId || null,
                    moshafName: track.moshafName || null, ayah: track.ayah || null,
                    bytes, savedAt: Date.now()
                });
                if (!writeIndex(items)) throw new Error('تعذّر حفظ فهرس التنزيلات على الجهاز.');
                this.emit({ status: 'done', track, bytes, progress: 1 });
                return true;
            } catch (error) {
                if (/Failed to fetch|NetworkError/i.test(String(error?.message))) {
                    error = new Error('تعذّر التنزيل. قد يمنع خادم التسجيل الحفظ أو انقطع الإنترنت.');
                }
                this.emit({ status: 'error', track, error: error.message });
                throw error;
            } finally {
                this.active = false;
            }
        }

        async remove(url) {
            if (!this.supported()) return false;
            const cache = await caches.open(CACHE_NAME);
            const removed = await cache.delete(url, { ignoreVary: true });
            writeIndex(readIndex().filter(item => item.url !== url));
            this.emit({ status: 'removed', url });
            return removed;
        }

        async clear() {
            if (!this.supported()) return false;
            await caches.delete(CACHE_NAME);
            writeIndex([]);
            this.emit({ status: 'cleared' });
            return true;
        }
    }

    const api = { CACHE_NAME, INDEX_KEY, DownloadManager, humanSize };
    if (typeof window !== 'undefined') window.QuranDownloads = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
