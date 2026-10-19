(() => {
    'use strict';

    const core = window.QuranAudio;
    const registry = window.QudAudioRegistry;
    if (!core || !registry?.reciters?.length || !core.AudioEngine) return;

    // These three *different* Hafs sheikhs have Quran Foundation chapter audio
    // paired with actual word timestamps. All 114 chapters were audited on
    // 2026-10-16 (6236 verses each). Two isolated verses have no word segments;
    // they retain accurate verse highlighting without fabricated word timings.
    // Keep the IDs separate from the QUD bundle (9000–9018).
    const FOUNDATION_RECITERS = Object.freeze([
        { id: 9020, foundationId: 3, slug: 'foundation-abdur-rahman-as-sudais', name: 'عبد الرحمن السديس' },
        { id: 9021, foundationId: 5, slug: 'foundation-hani-ar-rifai', name: 'هاني الرفاعي' },
        { id: 9022, foundationId: 10, slug: 'foundation-saud-ash-shuraym', name: 'سعود الشريم' }
    ]);
    const reciters = [
        ...registry.reciters.filter(item =>
            Number.isSafeInteger(Number(item.id)) && item.slug && item.name && item.timingUrl && item.catalogUrl),
        ...FOUNDATION_RECITERS
    ];
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

    async function fetchWithDeadline(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        try {
            const response = await fetch(absoluteUrl(url), {
                cache: 'force-cache', ...options, signal: controller.signal
            });
            // Keep aborting a stalled body download, not just stalled headers.
            return { response, done: () => clearTimeout(timeout) };
        } catch (error) {
            clearTimeout(timeout);
            if (controller.signal.aborted) {
                throw new Error('انتهت مهلة جلب بيانات القارئ. تحقق من الاتصال وأعد المحاولة.');
            }
            throw error;
        }
    }

    async function fetchJson(url) {
        const { response, done } = await fetchWithDeadline(url);
        try {
            if (!response.ok) throw new Error(`QUD metadata HTTP ${response.status}`);
            return await response.json();
        } finally { done(); }
    }

    async function fetchMaybeGzipJson(url) {
        const { response, done } = await fetchWithDeadline(url);
        let bytes;
        try {
            if (!response.ok) throw new Error(`QUD timings HTTP ${response.status}`);
            bytes = new Uint8Array(await response.arrayBuffer());
        } finally { done(); }
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

    async function loadFoundationChapter(reciter, surah) {
        const endpoint = `https://api.quran.com/api/v4/chapter_recitations/${reciter.foundationId}/${surah}?segments=true`;
        const { response, done } = await fetchWithDeadline(endpoint);
        let payload;
        try {
            if (!response.ok) throw new Error(`تعذّر تحميل توقيت القارئ (HTTP ${response.status}).`);
            payload = await response.json();
        } finally { done(); }
        const file = payload?.audio_file;
        const expected = core.VERSE_COUNTS[surah - 1];
        const audioUrl = String(file?.audio_url || '');
        if (Number(file?.chapter_id) !== surah ||
            !Array.isArray(file?.timestamps) || file.timestamps.length !== expected) {
            throw new Error('بيانات توقيت السورة غير مكتملة.');
        }
        if (!safeAudioUrl(audioUrl) ||
            new URL(audioUrl).hostname.toLowerCase() !== 'download.quranicaudio.com') {
            throw new Error('مصدر التسجيل غير معتمد لهذا القارئ.');
        }
        const knownMissing = new Set(['5:89:1', '10:12:76']);
        const verses = file.timestamps.map((timing, index) => {
            const ayah = index + 1;
            const start = Number(timing.timestamp_from);
            const end = Number(timing.timestamp_to);
            if (timing.verse_key !== `${surah}:${ayah}` ||
                !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
                throw new Error(`توقيت الآية ${surah}:${ayah} غير صالح.`);
            }
            const segments = (Array.isArray(timing.segments) ? timing.segments : [])
                .map(segment => Array.isArray(segment) && segment.length === 3 ? {
                    word: Number(segment[0]),
                    start: Number(segment[1]),
                    end: Number(segment[2])
                } : null)
                .filter(segment => segment && Number.isSafeInteger(segment.word) &&
                    segment.word > 0 && Number.isFinite(segment.start) &&
                    Number.isFinite(segment.end) && segment.start >= 0 &&
                    segment.end > segment.start)
                .sort((a, b) => a.start - b.start);
            if (!segments.length && !knownMissing.has(`${reciter.foundationId}:${surah}:${ayah}`)) {
                throw new Error(`تظليل الكلمات غير متاح للآية ${surah}:${ayah}.`);
            }
            return {
                surah, ayah, audioUrl,
                timestampFrom: start, timestampTo: end, duration: end - start,
                segments, source: 'Quran Foundation chapter audio'
            };
        });
        return {
            reciterId: Number(reciter.id), reciterSlug: reciter.slug, surah,
            audioUrl, fileSize: 0, format: 'mp3',
            verses, byAyah: new Map(verses.map(item => [item.ayah, item]))
        };
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
            if (reciter.foundationId) return loadFoundationChapter(reciter, surah);
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

    function seekWhenMetadataReady(engine, audio, target, version) {
        const apply = () => {
            if (version !== engine.prepareVersion || audio !== engine.audio) return;
            if (!Number.isFinite(target) || target < 0) return;
            try {
                if (Math.abs((Number(audio.currentTime) || 0) - target) > 0.05) {
                    audio.currentTime = target;
                }
            } catch (_) { /* Some engines reject seeking until metadata is ready. */ }
        };
        if (audio.readyState >= 1) apply();
        else audio.addEventListener('loadedmetadata', apply, { once: true });
    }

    const proto = core.AudioEngine.prototype;
    const originalBindAudio = proto.bindAudio;
    proto.bindAudio = function() {
        originalBindAudio.call(this);
        const element = this.audio;
        // Loading a new reciter's metadata is passive preparation, not an
        // actual request to play. Core loadstart/waiting events must not
        // leave the Play button spinning while it is still paused.
        const restorePassiveReady = () => {
            if (element !== this.audio || !this.__qudPreloadingOnly ||
                this.state.provider !== 'quran-foundation' ||
                !byId.has(Number(this.state.reciterId)) ||
                !this.currentTiming || this.audio.error ||
                !this.audio.paused || this.status !== 'loading') return;
            this.status = 'ready';
            this.emit();
        };
        element.addEventListener('loadstart', restorePassiveReady);
        element.addEventListener('waiting', restorePassiveReady);
        element.addEventListener('stalled', restorePassiveReady);
        let stalledTimer = null;
        const clearStall = () => {
            if (stalledTimer !== null) clearTimeout(stalledTimer);
            stalledTimer = null;
        };
        const watchStall = () => {
            clearStall();
            if (element !== this.audio || !this.intentToPlay ||
                this.state.provider !== 'quran-foundation' ||
                !byId.has(Number(this.state.reciterId))) return;
            const selectedReciter = this.state.reciterId;
            const selectedSurah = this.state.surah;
            stalledTimer = setTimeout(() => {
                if (element !== this.audio || !this.intentToPlay ||
                    this.state.reciterId !== selectedReciter ||
                    this.state.surah !== selectedSurah ||
                    this.status !== 'loading') return;
                this.status = 'error';
                this.error = navigator.onLine === false
                    ? 'انقطع الاتصال أثناء التلاوة. ستستمر عند رجوع الإنترنت.'
                    : 'خادم التلاوة توقف عن إرسال الصوت. تحقق من الاتصال وأعد التشغيل.';
                this.emit();
            }, 22000);
        };
        element.addEventListener('waiting', watchStall);
        element.addEventListener('stalled', watchStall);
        element.addEventListener('playing', clearStall);
        element.addEventListener('canplay', clearStall);
        element.addEventListener('pause', clearStall);
        element.addEventListener('error', clearStall);
    };

    const originalPlay = proto.play;
    // Some third-party recitation hosts can leave HTMLMediaElement.play()
    // pending forever, producing an endless loading spinner in Android.
    // Bound that wait only for online QUD/Foundation voices, never Mishary.
    proto.play = async function() {
        if (this.state.provider !== 'quran-foundation' ||
            !byId.has(Number(this.state.reciterId))) {
            return originalPlay.call(this);
        }
        // A retry must re-create an errored media request, not call play()
        // against the same failed element and instantly fail again.
        if (this.status === 'error' && this.trackUrl) {
            return this.prepare({ autoplay: true });
        }
        this.__qudPreloadingOnly = false;
        const selectedAudio = this.audio;
        const selectedReciter = this.state.reciterId;
        const selectedVersion = this.prepareVersion;
        // A press must give immediate feedback while the remote host is
        // contacted, even if it has not yet emitted a waiting event.
        if (this.audio.paused && this.trackUrl) {
            this.status = 'loading';
            this.error = '';
            this.emit();
        }
        let timeout;
        const deadline = new Promise(resolve => {
            timeout = setTimeout(() => resolve('timeout'), 22000);
        });
        try {
            const outcome = await Promise.race([originalPlay.call(this), deadline]);
            if (outcome !== 'timeout') return outcome;
            // A slow request from an earlier reciter must never stop the
            // recording that the user switched to in the meantime.
            if (this.audio !== selectedAudio ||
                this.state.reciterId !== selectedReciter ||
                this.prepareVersion !== selectedVersion) return false;
            this.audio.pause();
            this.status = 'error';
            this.error = navigator.onLine === false
                ? 'انقطع الإنترنت أثناء تجهيز التلاوة. حاول مجددًا بعد رجوعه.'
                : 'خادم تسجيل هذا القارئ لم يستجب خلال ٢٢ ثانية. حاول مرة أخرى أو اختر قارئًا آخر.';
            this.emit();
            return false;
        } finally {
            clearTimeout(timeout);
        }
    };

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

    // The bundled Mishary engine owns __syncContinuousChapter for its own
    // recording. Other continuous aligned reciters need their own verse
    // cursor: HTMLAudioElement continues playing after the selected ayah.
    const previousContinuousSync = proto.__syncContinuousChapter;
    proto.__syncContinuousChapter = function() {
        previousContinuousSync?.call(this);
        const chapter = this.__continuousChapter;
        if (this.state.provider !== 'quran-foundation' ||
            !byId.has(Number(this.state.reciterId)) ||
            !chapter || this.__continuousAudio !== this.audio ||
            Number(chapter.surah) !== Number(this.state.surah) ||
            !Number.isFinite(this.audio.currentTime) ||
            this.audio.readyState < 1) return;

        const ms = this.audio.currentTime * 1000;
        const verses = chapter.verses;
        if (!verses?.length) return;
        // Binary search avoids scanning 286 verses on every animation frame.
        let lo = 0, hi = verses.length - 1, index = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (verses[mid].timestampFrom <= ms + 15) {
                index = mid;
                lo = mid + 1;
            } else hi = mid - 1;
        }
        if (index < 0) return;
        const active = verses[index];
        if (active.ayah === this.state.ayah) return;
        // Never jump across a gap in the timing metadata.
        if (ms > active.timestampTo + 150) return;
        this.state.ayah = active.ayah;
        this.currentTiming = active;
        this.state.position = this.audio.currentTime;
        this.persist();
        this.emit();
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
        this.__qudPreloadingOnly = !autoplay;
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

            const mediaUrl = window.QuranDownloads?.mediaFor
                ? await window.QuranDownloads.mediaFor(this, chapter.audioUrl) : chapter.audioUrl;
            if (version !== this.prepareVersion) return false;
            if (!sameTrack || this.audio.src !== mediaUrl || this.audio.error) {
                // Do not block the UI waiting for loadedmetadata. On slower hosts
                // that made the play button look frozen for up to eight seconds.
                // Arm the exact seek before load; loadedmetadata always fires
                // before real playback can advance, so the selected ayah remains exact.
                this.audio.preload = autoplay ? 'auto' : 'metadata';
                this.audio.src = mediaUrl;
                seekWhenMetadataReady(this, this.audio, target, version);
                this.audio.load();
            } else if (this.audio.readyState >= 1 &&
                Math.abs((Number(this.audio.currentTime) || 0) - target) > 0.05) {
                this.audio.currentTime = target;
            } else if (this.audio.readyState < 1) {
                seekWhenMetadataReady(this, this.audio, target, version);
            }

            this.audio.playbackRate = this.state.speed;
            this.updateMediaMetadata();
            this.status = this.audio.paused ? 'ready' : 'playing';
            this.persist();
            this.emit();
            if (autoplay) {
                const played = await this.play();
                if (!played) return false;
            }
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
        foundationReciters: Object.freeze([...FOUNDATION_RECITERS]),
        loadChapter
    });
})();
