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

// The aligned reader must play one continuous chapter file. Quran.com's chapter
// endpoint supplies that file plus absolute verse/word timestamps, so there is
// no media-element handoff at every ayah and therefore no artificial gap.
(() => {
    'use strict';

    if (typeof window === 'undefined') return;
    const core = window.QuranAudio;
    const AudioEngine = core?.AudioEngine;
    if (!AudioEngine || AudioEngine.prototype.__continuousChapterAudioV1) return;

    const proto = AudioEngine.prototype;
    const originalBindAudio = proto.bindAudio;
    const originalPrepare = proto.prepare;
    const originalGoTo = proto.goTo;
    const originalNext = proto.next;
    const originalPrevious = proto.previous;
    const originalHandleEnded = proto.handleEnded;
    const originalPreloadUpcomingVerse = proto.preloadUpcomingVerse;
    const originalDestroy = proto.destroy;
    const chapterCache = new Map();
    const boundElements = new WeakSet();

    function isTrustedAudioUrl(value) {
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && (
                url.hostname === 'download.quranicaudio.com' ||
                url.hostname.endsWith('.qurancdn.com') ||
                url.hostname.endsWith('.quran.com')
            );
        } catch (_) {
            return false;
        }
    }

    function parseChapterPayload(payload, reciterId, surah) {
        const file = payload?.audio_file;
        if (!file || Number(file.chapter_id) !== Number(surah) ||
            !isTrustedAudioUrl(file.audio_url) || !Array.isArray(file.timestamps)) {
            throw new Error('Invalid chapter audio response');
        }

        const verses = file.timestamps.map(item => {
            const match = /^(\d+):(\d+)$/.exec(String(item.verse_key || ''));
            if (!match || Number(match[1]) !== Number(surah)) return null;
            const ayah = Number(match[2]);
            const timestampFrom = Number(item.timestamp_from);
            const timestampTo = Number(item.timestamp_to);
            if (!Number.isInteger(ayah) || !Number.isFinite(timestampFrom) ||
                !Number.isFinite(timestampTo) || timestampFrom < 0 || timestampTo <= timestampFrom) {
                return null;
            }
            const segments = (Array.isArray(item.segments) ? item.segments : [])
                .map(segment => Array.isArray(segment) ? {
                    word: Number(segment[0]),
                    start: Number(segment[1]),
                    end: Number(segment[2])
                } : null)
                .filter(segment => segment && Number.isInteger(segment.word) && segment.word > 0 &&
                    Number.isFinite(segment.start) && Number.isFinite(segment.end) &&
                    segment.start >= timestampFrom && segment.end > segment.start)
                .sort((a, b) => a.start - b.start);
            return {
                surah: Number(surah), ayah, audioUrl: file.audio_url,
                timestampFrom, timestampTo, duration: timestampTo - timestampFrom,
                segments, source: 'Quran Foundation chapter audio'
            };
        }).filter(Boolean).sort((a, b) => a.ayah - b.ayah);

        if (verses.length !== core.VERSE_COUNTS[Number(surah) - 1]) {
            throw new Error(`Incomplete chapter timing data: ${verses.length}`);
        }
        const byAyah = new Map(verses.map(item => [item.ayah, item]));
        return {
            reciterId: Number(reciterId), surah: Number(surah),
            audioUrl: file.audio_url, fileSize: Number(file.file_size) || 0,
            format: String(file.format || 'mp3'), verses, byAyah
        };
    }

    async function loadChapter(reciterId, surah) {
        const key = `${Number(reciterId)}:${Number(surah)}`;
        if (chapterCache.has(key)) return chapterCache.get(key);
        const promise = (async () => {
            const url = `${core.QURAN_API}/chapter_recitations/${Number(reciterId)}/${Number(surah)}?segments=true`;
            const response = await fetch(url, { cache: 'force-cache' });
            if (!response.ok) throw new Error(`Quran chapter audio HTTP ${response.status}`);
            return parseChapterPayload(await response.json(), reciterId, surah);
        })().catch(error => {
            chapterCache.delete(key);
            throw error;
        });
        chapterCache.set(key, promise);
        return promise;
    }

    function findTiming(chapter, milliseconds) {
        if (!chapter?.verses?.length) return null;
        let low = 0;
        let high = chapter.verses.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            const timing = chapter.verses[mid];
            if (milliseconds < timing.timestampFrom) high = mid - 1;
            else if (milliseconds >= timing.timestampTo) low = mid + 1;
            else return timing;
        }
        if (low <= 0) return chapter.verses[0];
        if (low >= chapter.verses.length) return chapter.verses.at(-1);
        return chapter.verses[low];
    }

    function waitForMetadata(audio, timeout = 5000) {
        if (audio.readyState >= 1) return Promise.resolve(true);
        return new Promise((resolve, reject) => {
            let timer = null;
            const cleanup = () => {
                clearTimeout(timer);
                audio.removeEventListener('loadedmetadata', onReady);
                audio.removeEventListener('error', onError);
            };
            const onReady = () => { cleanup(); resolve(true); };
            const onError = () => { cleanup(); reject(new Error('Chapter audio metadata failed to load')); };
            timer = setTimeout(() => {
                cleanup();
                reject(new Error('Chapter audio metadata timed out'));
            }, timeout);
            audio.addEventListener('loadedmetadata', onReady, { once: true });
            audio.addEventListener('error', onError, { once: true });
        });
    }

    function clampAyah(surah, ayah) {
        return Math.min(core.VERSE_COUNTS[surah - 1], Math.max(1, Number(ayah) || 1));
    }

    proto.getAlignedChapterAudio = function(surah = this.state.surah) {
        return loadChapter(this.state.reciterId, Number(surah));
    };

    proto.__syncContinuousChapter = function() {
        const chapter = this.__continuousChapter;
        if (!chapter || this.state.provider !== 'quran-foundation' ||
            this.audio !== this.__continuousAudio) return;
        const milliseconds = Math.max(0, Number(this.audio.currentTime) || 0) * 1000;
        const timing = findTiming(chapter, milliseconds);
        if (!timing) return;

        const repeat = this.state.repeat;
        const previousTiming = this.currentTiming;
        if (repeat?.mode === 'verse' && previousTiming &&
            milliseconds >= previousTiming.timestampTo && this.intentToPlay) {
            repeat.completed += 1;
            if (repeat.completed < repeat.count) {
                this.audio.currentTime = previousTiming.timestampFrom / 1000;
                this.state.position = this.audio.currentTime;
                this.persist();
                return;
            }
            repeat.completed = 0;
            repeat.mode = 'off';
            this.persist();
        }

        if (repeat?.mode === 'range' && previousTiming && previousTiming.ayah === repeat.end &&
            milliseconds >= previousTiming.timestampTo && this.intentToPlay) {
            repeat.completed += 1;
            if (repeat.completed < repeat.count) {
                const restart = chapter.byAyah.get(repeat.start);
                if (restart) {
                    this.state.ayah = restart.ayah;
                    this.currentTiming = restart;
                    this.audio.currentTime = restart.timestampFrom / 1000;
                    this.state.position = this.audio.currentTime;
                    this.persist();
                    this.updateMediaMetadata();
                    this.emit();
                    return;
                }
            } else {
                repeat.completed = 0;
                repeat.mode = 'off';
                this.persist();
            }
        }

        if (this.currentTiming?.ayah === timing.ayah) return;
        this.currentTiming = timing;
        this.state.surah = timing.surah;
        this.state.ayah = timing.ayah;
        this.state.position = Number(this.audio.currentTime) || 0;
        this.updateMediaMetadata();
        this.persist();
        this.emit();
    };

    proto.bindAudio = function(...args) {
        const element = this.audio;
        if (element && !boundElements.has(element)) {
            boundElements.add(element);
            element.addEventListener('timeupdate', () => {
                if (element === this.audio) this.__syncContinuousChapter();
            });
            element.addEventListener('seeked', () => {
                if (element === this.audio) this.__syncContinuousChapter();
            });
        }
        return originalBindAudio.apply(this, args);
    };

    proto.preloadUpcomingVerse = function(...args) {
        if (this.__continuousChapter && this.state.provider === 'quran-foundation') return;
        return originalPreloadUpcomingVerse.apply(this, args);
    };

    proto.prepare = async function(options = {}) {
        if (this.state.provider !== 'quran-foundation') {
            this.__continuousChapter = null;
            this.__continuousAudio = null;
            return originalPrepare.apply(this, [options]);
        }

        const autoplay = !!options.autoplay;
        const previousPosition = Number(this.state.position) || 0;
        const version = ++this.prepareVersion;
        if (autoplay) this.intentToPlay = true;
        this.status = 'loading';
        this.error = '';
        this.emit();

        try {
            const chapter = await loadChapter(this.state.reciterId, this.state.surah);
            if (version !== this.prepareVersion) return false;
            const ayah = clampAyah(this.state.surah, this.state.ayah);
            const timing = chapter.byAyah.get(ayah);
            if (!timing) throw new Error('Verse timing is unavailable');

            this.clearUpcomingVerse();
            this.__continuousChapter = chapter;
            this.__continuousAudio = this.audio;
            this.currentTiming = timing;
            const sameTrack = this.trackUrl === chapter.audioUrl;
            this.trackUrl = chapter.audioUrl;
            this.state.ayah = ayah;
            const verseStart = timing.timestampFrom / 1000;
            const verseEnd = timing.timestampTo / 1000;
            const target = previousPosition >= verseStart && previousPosition < verseEnd
                ? previousPosition : verseStart;
            this.state.position = target;
            this.pendingResume = 0;

            if (!sameTrack || this.audio.src !== chapter.audioUrl) {
                this.audio.preload = 'auto';
                this.audio.src = chapter.audioUrl;
                this.audio.load();
                if (target > 0) {
                    await waitForMetadata(this.audio);
                    if (version !== this.prepareVersion) return false;
                    this.audio.currentTime = target;
                }
            } else if (Math.abs((Number(this.audio.currentTime) || 0) - target) > 0.05) {
                this.audio.currentTime = target;
            }

            this.audio.playbackRate = this.state.speed;
            this.updateMediaMetadata();
            this.status = this.audio.paused ? 'ready' : 'playing';
            this.persist();
            this.emit();
            if (autoplay) await this.play();
            return true;
        } catch (error) {
            if (version !== this.prepareVersion) return false;
            this.__continuousChapter = null;
            this.__continuousAudio = null;
            this.state.position = previousPosition;
            console.warn('Continuous chapter audio unavailable; falling back to verse files.', error);
            return originalPrepare.apply(this, [options]);
        }
    };

    proto.goTo = async function(surah, ayah = 1, options = {}) {
        if (this.state.provider !== 'quran-foundation') {
            return originalGoTo.apply(this, [surah, ayah, options]);
        }

        const autoplay = options.autoplay ?? (!this.audio.paused || this.intentToPlay);
        surah = Math.min(114, Math.max(1, Number(surah) || 1));
        ayah = clampAyah(surah, ayah);
        const sameChapter = this.__continuousChapter?.surah === surah &&
            this.__continuousChapter?.reciterId === this.state.reciterId &&
            this.trackUrl === this.__continuousChapter?.audioUrl;

        this.state.surah = surah;
        this.state.ayah = ayah;
        const maxAyah = core.VERSE_COUNTS[surah - 1];
        this.state.repeat.start = Math.min(maxAyah, Math.max(1, this.state.repeat.start));
        this.state.repeat.end = Math.min(maxAyah, Math.max(1, this.state.repeat.end));
        if (this.state.repeat.start > this.state.repeat.end) {
            [this.state.repeat.start, this.state.repeat.end] = [this.state.repeat.end, this.state.repeat.start];
        }
        if (!options.preserveRepeat) this.state.repeat.completed = 0;

        if (sameChapter) {
            const timing = this.__continuousChapter.byAyah.get(ayah);
            if (!timing) return false;
            this.currentTiming = timing;
            const target = timing.timestampFrom / 1000;
            this.state.position = target;
            this.pendingResume = 0;
            if (!autoplay && !this.audio.paused) this.audio.pause();
            this.audio.currentTime = target;
            this.updateMediaMetadata();
            this.persist();
            this.emit();
            if (autoplay) await this.play();
            return true;
        }

        this.audio.pause();
        this.trackUrl = '';
        this.__continuousChapter = null;
        this.__continuousAudio = null;
        this.currentTiming = null;
        this.pendingResume = 0;
        return this.prepare({ autoplay });
    };

    proto.next = async function(options = {}) {
        if (this.state.provider !== 'quran-foundation') {
            return originalNext.apply(this, [options]);
        }
        const autoplay = options.autoplay ?? (!this.audio.paused || this.intentToPlay);
        if (this.state.ayah < core.VERSE_COUNTS[this.state.surah - 1]) {
            return this.goTo(this.state.surah, this.state.ayah + 1, { autoplay });
        }
        if (this.state.surah < 114) return this.goTo(this.state.surah + 1, 1, { autoplay });
        return false;
    };

    proto.previous = async function(options = {}) {
        if (this.state.provider !== 'quran-foundation') {
            return originalPrevious.apply(this, [options]);
        }
        const autoplay = options.autoplay ?? (!this.audio.paused || this.intentToPlay);
        const start = (this.currentTiming?.timestampFrom || 0) / 1000;
        if ((Number(this.audio.currentTime) || 0) > start + 3) {
            this.audio.currentTime = start;
            this.state.position = start;
            this.persist();
            this.emit('time');
            return true;
        }
        if (this.state.ayah > 1) return this.goTo(this.state.surah, this.state.ayah - 1, { autoplay });
        if (this.state.surah > 1) {
            return this.goTo(this.state.surah - 1, core.VERSE_COUNTS[this.state.surah - 2], { autoplay });
        }
        return false;
    };

    proto.handleEnded = async function(...args) {
        if (this.state.provider !== 'quran-foundation' || !this.__continuousChapter) {
            return originalHandleEnded.apply(this, args);
        }
        const repeat = this.state.repeat;
        if (repeat.mode === 'surah') {
            repeat.completed = 0;
            this.state.ayah = 1;
            this.currentTiming = this.__continuousChapter.byAyah.get(1) || null;
            this.audio.currentTime = 0;
            this.state.position = 0;
            this.persist();
            await this.play();
            return;
        }
        if (this.state.surah < 114) {
            await this.goTo(this.state.surah + 1, 1, { autoplay: true });
        }
    };

    proto.destroy = function(...args) {
        this.__continuousChapter = null;
        this.__continuousAudio = null;
        return originalDestroy.apply(this, args);
    };

    proto.__continuousChapterAudioV1 = true;
})();
