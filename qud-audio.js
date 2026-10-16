(() => {
    'use strict';

    const core = window.QuranAudio;
    const registry = window.QudAudioRegistry;
    if (!core || !registry?.reciters?.length || !core.AudioEngine) return;

    const reciters = registry.reciters.filter(item =>
        Number.isSafeInteger(Number(item.id)) && item.slug && item.name && item.timingUrl && item.catalogUrl);
    if (!reciters.length) return;

    const byId = new Map(reciters.map(item => [Number(item.id), item]));
    const chapterCache = new Map();
    const timingDocCache = new Map();
    const catalogCache = new Map();

    // mushaf-audio.js snapshots this array while it starts. Extend the public
    // list synchronously so all mirrored QUD reciters are present in the picker
    // before the UI is rendered. The AudioEngine private map is populated on
    // demand by the selectAligned wrapper below.
    const baseAligned = Array.isArray(core.ALIGNED_RECITERS) ? core.ALIGNED_RECITERS : [];
    const existingIds = new Set(baseAligned.map(item => Number(item.id)));
    core.ALIGNED_RECITERS = Object.freeze([
        ...baseAligned,
        ...reciters.filter(item => !existingIds.has(Number(item.id))).map(item => ({
            id: Number(item.id),
            name: item.name,
            label: `${item.name} • تظليل الكلمات`
        }))
    ]);

    function absoluteUrl(value) {
        return new URL(String(value), location.href).href;
    }

    function safeAudioUrl(value) {
        try {
            const url = new URL(String(value));
            return url.protocol === 'https:' && !url.username && !url.password &&
                !['youtube.com', 'www.youtube.com', 'youtu.be', 'drive.google.com', 'docs.google.com']
                    .includes(url.hostname.toLowerCase());
        } catch (_) {
            return false;
        }
    }

    async function fetchJson(url) {
        const response = await fetch(absoluteUrl(url), { cache: 'force-cache' });
        if (!response.ok) throw new Error(`QUD metadata HTTP ${response.status}`);
        return response.json();
    }

    async function fetchMaybeGzipJson(url) {
        const response = await fetch(absoluteUrl(url), { cache: 'force-cache' });
        if (!response.ok) throw new Error(`QUD timings HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        let text;
        if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
            if (typeof DecompressionStream !== 'function') {
                throw new Error('المتصفح قديم ولا يدعم فك ضغط بيانات تظليل الكلمات.');
            }
            const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
            text = await new Response(stream).text();
        } else {
            text = new TextDecoder('utf-8').decode(bytes);
        }
        return JSON.parse(text);
    }

    async function loadCatalog(reciter) {
        if (!catalogCache.has(reciter.slug)) {
            const promise = fetchJson(reciter.catalogUrl).then(payload => {
                if (payload?.slug !== reciter.slug || !payload?.audio?.chapter_urls) {
                    throw new Error('بيانات مصدر الصوت غير صالحة.');
                }
                return payload;
            }).catch(error => {
                catalogCache.delete(reciter.slug);
                throw error;
            });
            catalogCache.set(reciter.slug, promise);
        }
        return catalogCache.get(reciter.slug);
    }

    async function loadTimingDoc(reciter) {
        if (!timingDocCache.has(reciter.slug)) {
            const promise = fetchMaybeGzipJson(reciter.timingUrl).then(payload => {
                const meta = payload?._meta || {};
                if (meta.schema_version !== 3 || meta.tier !== 'word' ||
                    String(meta.riwayah || 'hafs').toLowerCase() !== 'hafs' ||
                    !Array.isArray(payload?.rows)) {
                    throw new Error('صيغة توقيت الكلمات غير مدعومة.');
                }
                return payload;
            }).catch(error => {
                timingDocCache.delete(reciter.slug);
                throw error;
            });
            timingDocCache.set(reciter.slug, promise);
        }
        return timingDocCache.get(reciter.slug);
    }

    async function loadChapter(reciterOrId, surah) {
        const reciter = typeof reciterOrId === 'object' ? reciterOrId : byId.get(Number(reciterOrId));
        surah = Number(surah);
        if (!reciter || !Number.isInteger(surah) || surah < 1 || surah > 114) {
            throw new Error('قارئ أو سورة غير صالحين.');
        }
        const key = `${reciter.id}:${surah}`;
        if (chapterCache.has(key)) return chapterCache.get(key);

        const promise = (async () => {
            const [catalog, timingDoc] = await Promise.all([loadCatalog(reciter), loadTimingDoc(reciter)]);
            const chapterKey = String(surah);
            const audioUrl = String(catalog.audio.chapter_urls?.[chapterKey] || '');
            if (!safeAudioUrl(audioUrl)) throw new Error('رابط تسجيل السورة غير صالح.');
            const offset = Math.max(0, Number(catalog.audio.chapter_offsets_ms?.[chapterKey]) || 0);
            const expected = core.VERSE_COUNTS[surah - 1];
            const verses = [];

            for (const row of timingDoc.rows) {
                if (!Array.isArray(row) || row.length !== 6 || row[3] !== true) continue;
                const match = /^(\d+):(\d+)$/.exec(String(row[0] || ''));
                if (!match || Number(match[1]) !== surah) continue;
                const ayah = Number(match[2]);
                const start = Number(row[1]);
                const end = Number(row[2]);
                const words = Array.isArray(row[5]) ? row[5] : [];
                if (!Number.isInteger(ayah) || !Number.isFinite(start) || !Number.isFinite(end) ||
                    start < 0 || end <= start || !words.length) continue;
                // QUD's v3 schema permits a reviewed word span to touch or
                // slightly cross its verse occurrence boundary. Keep the
                // producer timing intact; syncHighlight already clips drawing
                // to the active verse's timestampFrom/timestampTo interval.
                const segments = words.map(word => Array.isArray(word) ? {
                    word: Number(word[0]),
                    start: offset + Number(word[1]),
                    end: offset + Number(word[2])
                } : null).filter(word => word && Number.isInteger(word.word) && word.word > 0 &&
                    Number.isFinite(word.start) && Number.isFinite(word.end) &&
                    word.start >= 0 && word.end > word.start)
                    .sort((a, b) => a.start - b.start);
                if (!segments.length) continue;
                verses.push({
                    surah, ayah, audioUrl,
                    timestampFrom: offset + start,
                    timestampTo: offset + end,
                    duration: end - start,
                    segments,
                    source: `QUD ${registry.qudRelease || ''}`.trim()
                });
            }

            verses.sort((a, b) => a.ayah - b.ayah);
            if (verses.length !== expected || verses.some((item, index) => item.ayah !== index + 1)) {
                throw new Error(`بيانات سورة ${surah} غير مكتملة (${verses.length}/${expected}).`);
            }
            const byAyah = new Map(verses.map(item => [item.ayah, item]));
            return {
                reciterId: Number(reciter.id),
                reciterSlug: reciter.slug,
                surah,
                audioUrl,
                fileSize: 0,
                format: 'mp3',
                verses,
                byAyah
            };
        })().catch(error => {
            chapterCache.delete(key);
            throw error;
        });
        chapterCache.set(key, promise);
        return promise;
    }

    function waitForMetadata(audio, timeout = 8000) {
        if (audio.readyState >= 1) return Promise.resolve(true);
        return new Promise((resolve, reject) => {
            let timer = null;
            const cleanup = () => {
                clearTimeout(timer);
                audio.removeEventListener('loadedmetadata', onReady);
                audio.removeEventListener('error', onError);
            };
            const onReady = () => { cleanup(); resolve(true); };
            const onError = () => { cleanup(); reject(new Error('تعذّر تحميل ملف صوت السورة.')); };
            timer = setTimeout(() => { cleanup(); reject(new Error('انتهت مهلة تحميل ملف صوت السورة.')); }, timeout);
            audio.addEventListener('loadedmetadata', onReady, { once: true });
            audio.addEventListener('error', onError, { once: true });
        });
    }

    const proto = core.AudioEngine.prototype;
    const originalSelectAligned = proto.selectAligned;
    const originalPrepare = proto.prepare;
    const originalGoTo = proto.goTo;
    const originalGetAlignedChapterAudio = proto.getAlignedChapterAudio;

    proto.selectAligned = function(reciterId = 7, options = {}) {
        const reciter = byId.get(Number(reciterId));
        if (reciter && !this.alignedReciters?.has(Number(reciterId))) {
            this.registerAlignedReciter({ id: Number(reciter.id), name: reciter.name });
        }
        return originalSelectAligned.apply(this, [reciterId, options]);
    };

    proto.getAlignedChapterAudio = function(surah = this.state.surah) {
        const reciter = byId.get(Number(this.state.reciterId));
        if (reciter) return loadChapter(reciter, Number(surah));
        return originalGetAlignedChapterAudio?.apply(this, [surah]);
    };

    proto.goTo = function(surah, ayah = 1, options = {}) {
        if (byId.has(Number(this.state.reciterId)) && Number(surah) !== Number(this.state.surah)) {
            this.state.position = 0;
        }
        return originalGoTo.apply(this, [surah, ayah, options]);
    };

    proto.prepare = async function(options = {}) {
        const reciter = byId.get(Number(this.state.reciterId));
        if (!reciter || this.state.provider !== 'quran-foundation') {
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
            const chapter = await loadChapter(reciter, this.state.surah);
            if (version !== this.prepareVersion) return false;
            const ayah = Math.min(core.VERSE_COUNTS[this.state.surah - 1],
                Math.max(1, Number(this.state.ayah) || 1));
            const timing = chapter.byAyah.get(ayah);
            if (!timing) throw new Error('توقيت الآية غير متاح.');

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
                await waitForMetadata(this.audio);
                if (version !== this.prepareVersion) return false;
                if (target > 0) this.audio.currentTime = target;
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
            this.currentTiming = null;
            this.state.position = previousPosition;
            this.status = 'error';
            this.error = navigator.onLine === false
                ? 'بيانات أو صوت القارئ غير متاحة دون إنترنت. افتح السورة مرة واحدة وأنت متصل.'
                : (error?.message || 'تعذّر تجهيز التلاوة المتزامنة.');
            console.warn('QUD synchronized audio failed', reciter.slug, error);
            this.emit();
            return false;
        }
    };

    if (core.TimingProvider?.prototype) {
        const timingProto = core.TimingProvider.prototype;
        const originalChapter = timingProto.chapter;
        const originalVerse = timingProto.verse;
        timingProto.chapter = async function(recitationId, surah) {
            const reciter = byId.get(Number(recitationId));
            if (!reciter) return originalChapter.apply(this, [recitationId, surah]);
            const chapter = await loadChapter(reciter, Number(surah));
            return new Map(chapter.verses.map(item => [item.ayah, item]));
        };
        timingProto.verse = async function(recitationId, surah, ayah) {
            const reciter = byId.get(Number(recitationId));
            if (!reciter) return originalVerse.apply(this, [recitationId, surah, ayah]);
            const chapter = await loadChapter(reciter, Number(surah));
            const timing = chapter.byAyah.get(Number(ayah));
            if (!timing) throw new Error('توقيت الآية غير متاح.');
            return timing;
        };
    }

    window.QuranQud = Object.freeze({
        release: registry.qudRelease,
        license: registry.license,
        reciters: Object.freeze([...reciters]),
        loadChapter
    });
})();
