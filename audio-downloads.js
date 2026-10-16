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

// Gapless handoff for the word-aligned Quran Foundation reader. This layer is
// loaded after audio-core.js and before mushaf-audio.js, so it can refine the
// engine without changing MP3Quran playback or the public player API.
(() => {
    'use strict';

    if (typeof window === 'undefined') return;
    const AudioEngine = window.QuranAudio?.AudioEngine;
    if (!AudioEngine || AudioEngine.prototype.__gaplessAlignedV2) return;

    const proto = AudioEngine.prototype;
    const originalPlay = proto.play;
    const originalPause = proto.pause;
    const originalSeek = proto.seek;
    const originalSetSpeed = proto.setSpeed;
    const originalSetRepeat = proto.setRepeat;
    const originalClearUpcomingVerse = proto.clearUpcomingVerse;
    const originalDestroy = proto.destroy;
    const PRIME_SECONDS = 0.20;
    const TAIL_GUARD_SECONDS = 0.035;
    const HANDOFF_TOLERANCE_SECONDS = 0.012;
    const raf = window.requestAnimationFrame?.bind(window) ||
        (callback => setTimeout(() => callback(performance.now()), 16));
    const caf = window.cancelAnimationFrame?.bind(window) || clearTimeout;

    function firstSegmentSecond(timing) {
        const segment = timing?.segments?.[0];
        return Number.isFinite(segment?.start) ? Math.max(0, segment.start / 1000) : 0;
    }

    function lastSegmentSecond(timing) {
        const segments = timing?.segments;
        const segment = Array.isArray(segments) ? segments[segments.length - 1] : null;
        return Number.isFinite(segment?.end) ? Math.max(0, segment.end / 1000) : 0;
    }

    proto.__cancelGaplessPrime = function(resetAudio = true) {
        if (this._gaplessFrame) {
            caf(this._gaplessFrame);
            this._gaplessFrame = 0;
        }
        const primed = this._gaplessPrimed;
        this._gaplessPrimed = null;
        if (!primed?.audio || primed.audio === this.audio || !resetAudio) return;
        try {
            primed.audio.pause();
            primed.audio.muted = primed.originalMuted;
            primed.audio.currentTime = 0;
        } catch (_) { /* best-effort cleanup */ }
    };

    proto.__primeGaplessNext = function(pending, boundary) {
        if (!pending?.audio || this._gaplessPrimed?.audio === pending.audio) return;
        const current = this.audio;
        const first = firstSegmentSecond(pending.timing);
        const remaining = Math.max(0, boundary - current.currentTime);
        const next = pending.audio;
        const originalMuted = next.muted;
        try {
            next.playbackRate = this.state.speed;
            next.currentTime = Math.max(0, first - remaining);
            next.muted = true;
        } catch (_) { return; }

        const primed = {
            audio: next,
            pending,
            first,
            originalMuted,
            started: false
        };
        this._gaplessPrimed = primed;
        Promise.resolve(next.play()).then(() => {
            if (this._gaplessPrimed === primed) primed.started = true;
        }).catch(() => {
            if (this._gaplessPrimed === primed) {
                next.muted = originalMuted;
                this._gaplessPrimed = null;
            }
        });
    };

    proto.__commitGaplessNext = function() {
        const primed = this._gaplessPrimed;
        const pending = this.nextVerseAudio;
        if (!primed?.started || !pending || primed.pending !== pending ||
            pending.audio !== primed.audio) return false;
        if (pending.audio.currentTime + 0.06 < primed.first) return false;

        const old = this.audio;
        const next = pending.audio;
        if (this._gaplessFrame) {
            caf(this._gaplessFrame);
            this._gaplessFrame = 0;
        }

        this.audio = next;
        this.nextVerseAudio = null;
        this.nextVerseVersion++;
        this._gaplessPrimed = null;
        this.currentTiming = pending.timing;
        this.trackUrl = pending.timing.audioUrl;
        this.state.surah = pending.surah;
        this.state.ayah = pending.ayah;
        this.state.position = Number(next.currentTime) || 0;
        this.pendingResume = 0;
        next.volume = old.volume;
        next.muted = old.muted;
        next.playbackRate = this.state.speed;
        this.bindAudio();

        try {
            old.pause();
            old.removeAttribute('src');
        } catch (_) { /* the retired element no longer controls state */ }

        this.status = 'playing';
        this.error = '';
        this.updateMediaMetadata();
        this.persist();
        this.channel?.postMessage({ type: 'playing', sessionId: this.sessionId });
        this.emit();
        this.preloadUpcomingVerse();
        this.__startGaplessMonitor();
        return true;
    };

    proto.__startGaplessMonitor = function() {
        if (this._gaplessFrame) caf(this._gaplessFrame);
        const active = this.audio;
        const generation = (this._gaplessGeneration || 0) + 1;
        this._gaplessGeneration = generation;

        const tick = () => {
            this._gaplessFrame = 0;
            if (generation !== this._gaplessGeneration || this.audio !== active ||
                active.paused || !this.intentToPlay) return;

            const pending = this.nextVerseAudio;
            const normalSequentialPlayback =
                this.state.provider === 'quran-foundation' &&
                this.state.repeat?.mode === 'off' &&
                this.state.ayah < window.QuranAudio.VERSE_COUNTS[this.state.surah - 1] &&
                pending?.reciterId === this.state.reciterId &&
                pending.surah === this.state.surah &&
                pending.ayah === this.state.ayah + 1 &&
                pending.audio?.readyState >= 2;

            const spokenEnd = lastSegmentSecond(this.currentTiming);
            if (normalSequentialPlayback && spokenEnd > 0) {
                const duration = Number(active.duration);
                const safeEnd = Number.isFinite(duration) && duration > 0
                    ? Math.max(0, duration - 0.015)
                    : spokenEnd + TAIL_GUARD_SECONDS;
                const boundary = Math.min(
                    safeEnd,
                    spokenEnd + TAIL_GUARD_SECONDS
                );
                const remaining = boundary - active.currentTime;
                if (remaining <= PRIME_SECONDS && remaining > -0.08) {
                    this.__primeGaplessNext(pending, boundary);
                }
                if (remaining <= HANDOFF_TOLERANCE_SECONDS &&
                    this.__commitGaplessNext()) return;
            }

            this._gaplessFrame = raf(tick);
        };
        this._gaplessFrame = raf(tick);
    };

    proto.play = async function(...args) {
        const played = await originalPlay.apply(this, args);
        if (played) this.__startGaplessMonitor();
        return played;
    };

    proto.pause = function(...args) {
        this._gaplessGeneration = (this._gaplessGeneration || 0) + 1;
        this.__cancelGaplessPrime(true);
        return originalPause.apply(this, args);
    };

    proto.seek = function(...args) {
        this._gaplessGeneration = (this._gaplessGeneration || 0) + 1;
        this.__cancelGaplessPrime(true);
        const result = originalSeek.apply(this, args);
        if (!this.audio.paused && this.intentToPlay) this.__startGaplessMonitor();
        return result;
    };

    proto.setSpeed = function(...args) {
        const result = originalSetSpeed.apply(this, args);
        if (this.nextVerseAudio?.audio) {
            this.nextVerseAudio.audio.playbackRate = this.state.speed;
        }
        return result;
    };

    proto.setRepeat = function(...args) {
        this._gaplessGeneration = (this._gaplessGeneration || 0) + 1;
        this.__cancelGaplessPrime(true);
        return originalSetRepeat.apply(this, args);
    };

    proto.clearUpcomingVerse = function(...args) {
        const primed = this._gaplessPrimed;
        if (primed?.audio) {
            try {
                primed.audio.pause();
                primed.audio.muted = primed.originalMuted;
            } catch (_) { /* best-effort cleanup */ }
            this._gaplessPrimed = null;
        }
        return originalClearUpcomingVerse.apply(this, args);
    };

    proto.destroy = function(...args) {
        this._gaplessGeneration = (this._gaplessGeneration || 0) + 1;
        this.__cancelGaplessPrime(true);
        return originalDestroy.apply(this, args);
    };

    proto.__gaplessAlignedV2 = true;
})();
