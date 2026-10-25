(() => {
    'use strict';

    const MP3QURAN_API = 'https://mp3quran.net/api/v3/reciters?language=ar';
    const QURAN_API = 'https://api.quran.com/api/v4';
    const VERSE_AUDIO_ORIGIN = 'https://verses.quran.com/';
    const STATE_KEY = 'quranAudioStateV2';
    const CATALOG_KEY = 'quranRecitationCatalogV1';
    const CHANNEL_NAME = 'quran-audio-session-v1';
    const ALIGNED_RECITERS = Object.freeze([
        { id: 7, name: 'مشاري راشد العفاسي', label: 'مشاري العفاسي — مزامنة دقيقة' }
    ]);
    const READER_PRIORITY = Object.freeze([
        'مشاري العفاسي', 'ماهر المعيقلي', 'عبد الرحمن السديس', 'ياسر الدوسري',
        'عبد الباسط عبد الصمد', 'محمد صديق المنشاوي', 'محمود خليل الحصري',
        'سعد الغامدي', 'فارس عباد', 'أحمد العجمي'
    ]);
    const SURAH_NAMES = Object.freeze([
        'الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس',
        'هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه',
        'الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم',
        'لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر',
        'فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق',
        'الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة',
        'الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج',
        'نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس',
        'التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر',
        'البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة',
        'العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون',
        'النصر','المسد','الإخلاص','الفلق','الناس'
    ]);
    const VERSE_COUNTS = Object.freeze([
        7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
        112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,
        59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,
        52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,
        21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6
    ]);
    const DIGITS = '٠١٢٣٤٥٦٧٨٩';

    function arabicDigits(value) {
        return String(value).replace(/\d/g, digit => DIGITS[Number(digit)]);
    }

    function timeText(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '٠:٠٠';
        const whole = Math.floor(seconds);
        return arabicDigits(`${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`);
    }

    function normalizeArabic(value) {
        return String(value || '').normalize('NFKD')
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
            .replace(/[^\u0621-\u064A\d]+/g, ' ').trim();
    }

    function readJson(key, fallback = null) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : JSON.parse(value);
        } catch (_) { return fallback; }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (_) { return false; }
    }

    function validMp3Server(server) {
        try {
            const url = new URL(server);
            return url.protocol === 'https:' &&
                (url.hostname === 'mp3quran.net' || url.hostname.endsWith('.mp3quran.net')) &&
                !url.username && !url.password;
        } catch (_) { return false; }
    }

    function priorityIndex(name) {
        const normalized = normalizeArabic(name);
        const index = READER_PRIORITY.findIndex(item => {
            const preferred = normalizeArabic(item);
            const tokens = preferred.split(/\s+/).filter(Boolean);
            return normalized.includes(preferred) || preferred.includes(normalized) ||
                tokens.every(token => normalized.includes(token));
        });
        return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    }

    function sortReciters(reciters) {
        return [...reciters].sort((a, b) => {
            const priority = priorityIndex(a.name) - priorityIndex(b.name);
            return priority || a.name.localeCompare(b.name, 'ar', { sensitivity: 'base' });
        });
    }

    function normalizeCatalog(raw) {
        if (!raw || !Array.isArray(raw.reciters)) throw new Error('Invalid reciter catalog');
        const seen = new Set();
        const reciters = raw.reciters.map(item => {
            const id = Number(item.id);
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            if (!Number.isInteger(id) || id <= 0 || !name || seen.has(id)) return null;
            seen.add(id);
            const moshaf = (Array.isArray(item.moshaf) ? item.moshaf : []).map(entry => {
                const server = typeof entry.server === 'string' ? entry.server.trim() : '';
                const moshafId = Number(entry.id);
                if (!validMp3Server(server) || !Number.isInteger(moshafId) || moshafId <= 0) return null;
                const surahs = [...new Set(String(entry.surah_list || '').split(',')
                    .map(value => Number(value.trim()))
                    .filter(value => Number.isInteger(value) && value >= 1 && value <= 114))]
                    .sort((a, b) => a - b);
                if (!surahs.length) return null;
                return {
                    id: moshafId,
                    name: String(entry.name || 'التلاوة').trim(),
                    server: server.endsWith('/') ? server : `${server}/`,
                    surahs,
                    complete: surahs.length === 114
                };
            }).filter(Boolean);
            return moshaf.length ? { id, name, moshaf } : null;
        }).filter(Boolean);
        return sortReciters(reciters);
    }

    function bestMoshaf(reciter) {
        return [...(reciter?.moshaf || [])].sort((a, b) => {
            const score = item => item.surahs.length * 10 + (/حفص/.test(item.name) ? 2 : 0) +
                (/مرتل|مرتّل/.test(item.name) ? 1 : 0);
            return score(b) - score(a);
        })[0] || null;
    }

    function mp3Url(moshaf, surah) {
        if (!validMp3Server(moshaf?.server) || !moshaf?.surahs?.includes(Number(surah))) return null;
        return `${moshaf.server}${String(surah).padStart(3, '0')}.mp3`;
    }

    class CatalogService {
        constructor(fetcher = (...args) => fetch(...args)) {
            this.fetcher = fetcher;
            this.catalog = [];
        }

        cached() {
            const raw = readJson(CATALOG_KEY);
            if (!raw) return [];
            try { return normalizeCatalog(raw); } catch (_) { return []; }
        }

        async load() {
            const response = await this.fetcher(MP3QURAN_API, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`MP3Quran HTTP ${response.status}`);
            const raw = await response.json();
            const catalog = normalizeCatalog(raw);
            if (!catalog.length) throw new Error('Empty reciter catalog');
            writeJson(CATALOG_KEY, raw);
            this.catalog = catalog;
            return catalog;
        }

        preferred(catalog = this.catalog) {
            return catalog.find(item => normalizeArabic(item.name).includes(normalizeArabic('العفاسي'))) ||
                catalog[0] || null;
        }
    }

    class TimingProvider {
        constructor(fetcher = (...args) => fetch(...args)) {
            this.fetcher = fetcher;
            this.cache = new Map();
            this.verseCache = new Map();
        }

        offlineKey(recitationId, surah) {
            return new URL(`./offline-audio-timings/${recitationId}/${surah}.json`, location.href).href;
        }

        async savedChapter(recitationId, surah) {
            if (typeof caches === 'undefined' || typeof location === 'undefined') return null;
            try {
                const cache = await caches.open('quran-recitation-metadata-v1');
                const response = await cache.match(this.offlineKey(recitationId, surah));
                if (!response) return null;
                const payload = await response.json();
                const savedAt = Number(payload.savedAt) || 0;
                if (!Number.isSafeInteger(savedAt) || savedAt > Date.now() ||
                    Date.now() - savedAt >= 7 * 24 * 60 * 60 * 1000) {
                    await cache.delete(this.offlineKey(recitationId, surah));
                    return null;
                }
                if (payload.recitationId !== recitationId || payload.surah !== surah ||
                    !Array.isArray(payload.verses) || payload.verses.length !== VERSE_COUNTS[surah - 1]) return null;
                const verses = new Map(payload.verses.map(item => [item.ayah, item]));
                if (verses.size !== payload.verses.length) return null;
                verses.forEach((item, ayah) =>
                    this.verseCache.set(`${recitationId}:${surah}:${ayah}`, item));
                return verses;
            } catch (_) { return null; }
        }

        async saveChapter(recitationId, surah, verses) {
            if (typeof caches === 'undefined' || typeof location === 'undefined' ||
                verses.size !== VERSE_COUNTS[surah - 1]) return;
            try {
                const cache = await caches.open('quran-recitation-metadata-v1');
                await cache.put(this.offlineKey(recitationId, surah),
                    new Response(JSON.stringify({
                        recitationId, surah, savedAt: Date.now(), verses: [...verses.values()]
                    }), { headers: { 'Content-Type': 'application/json' } }));
            } catch (_) { /* Cache quota is best-effort; streaming still works online. */ }
        }

        async chapter(recitationId, surah) {
            recitationId = Number(recitationId);
            surah = Number(surah);
            const key = `${recitationId}:${surah}`;
            if (this.cache.has(key)) return this.cache.get(key);
            const promise = (async () => {
                const saved = await this.savedChapter(recitationId, surah);
                return saved || this.fetchChapter(recitationId, surah);
            })().catch(error => {
                this.cache.delete(key);
                throw error;
            });
            this.cache.set(key, promise);
            return promise;
        }

        parseAudioFiles(payload, surah) {
            const files = Array.isArray(payload?.audio_files) ? payload.audio_files :
                payload?.audio_file ? [payload.audio_file] : [];
            const verses = new Map();
            files.forEach(file => {
                const match = /^(\d+):(\d+)$/.exec(String(file.verse_key || ''));
                if (!match || Number(match[1]) !== Number(surah)) return;
                const ayah = Number(match[2]);
                const rawUrl = String(file.url || file.audio_url || '').trim();
                if (!rawUrl || !Number.isInteger(ayah)) return;
                const audioUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` :
                    new URL(rawUrl, VERSE_AUDIO_ORIGIN).href;
                const parsedAudioUrl = new URL(audioUrl);
                const trustedAudioHost = parsedAudioUrl.hostname === 'verses.quran.com' ||
                    parsedAudioUrl.hostname.endsWith('.qurancdn.com') ||
                    parsedAudioUrl.hostname.endsWith('.quran.com');
                if (parsedAudioUrl.protocol !== 'https:' || !trustedAudioHost) return;
                const segments = (Array.isArray(file.segments) ? file.segments : [])
                    .map(segment => Array.isArray(segment) ? {
                        word: Number(segment[0]), start: Number(segment[1]), end: Number(segment[2])
                    } : null)
                    .filter(segment => segment && Number.isInteger(segment.word) && segment.word > 0 &&
                        Number.isFinite(segment.start) && Number.isFinite(segment.end) &&
                        segment.start >= 0 && segment.end > segment.start)
                    .sort((a, b) => a.start - b.start);
                verses.set(ayah, {
                    surah: Number(surah), ayah, audioUrl, segments,
                    duration: Number(file.duration) || 0,
                    source: 'Quran Foundation Audio API'
                });
            });
            return verses;
        }

        async fetchChapter(recitationId, surah) {
            if (!ALIGNED_RECITERS.some(item => item.id === Number(recitationId))) {
                throw new Error('Unsupported aligned recording');
            }
            const verses = new Map();
            const totalVerses = VERSE_COUNTS[surah - 1];
            let page = 1;
            // The Quran API paginates verse audio. Fetch all pages, not just the
            // first page (otherwise "Read from here" fails later in a surah).
            while (page <= totalVerses) {
                const url = `${QURAN_API}/recitations/${recitationId}/by_chapter/${surah}?segments=true&per_page=50&page=${page}`;
                const response = await this.fetcher(url, { cache: 'no-store' });
                if (!response.ok) throw new Error(`Quran audio HTTP ${response.status}`);
                const payload = await response.json();
                const current = this.parseAudioFiles(payload, surah);
                if (!current.size) break;
                current.forEach((timing, ayah) => verses.set(ayah, timing));
                const pagination = payload.pagination || {};
                const next = Number(pagination.next_page);
                const totalPages = Number(pagination.total_pages);
                if (next > page) { page = next; continue; }
                if (totalPages > page) { page++; continue; }
                // Some API responses omit pagination metadata. Never guess that
                // 10/50/100 returned verses means the whole chapter is present.
                if (!pagination.total_pages && verses.size < totalVerses && current.size >= 50) {
                    page++;
                    continue;
                }
                break;
            }
            if (!verses.size) throw new Error('No aligned verses returned');
            verses.forEach((timing, ayah) =>
                this.verseCache.set(`${recitationId}:${surah}:${ayah}`, timing));
            await this.saveChapter(Number(recitationId), Number(surah), verses);
            return verses;
        }

        async verse(recitationId, surah, ayah) {
            const key = `${recitationId}:${surah}:${ayah}`;
            if (this.verseCache.has(key)) return this.verseCache.get(key);
            const promise = (async () => {
                // First try persisted timing metadata, even on a fresh offline launch.
                const saved = await this.savedChapter(Number(recitationId), Number(surah));
                if (saved?.has(ayah)) return saved.get(ayah);
                // Prefer the chapter cache when available; fall back to the
                // exact-ayah endpoint if the chapter response is incomplete.
                let chapter;
                try { chapter = await this.chapter(recitationId, surah); }
                catch (_) { /* The exact ayah may still be available. */ }
                if (chapter?.has(ayah)) return chapter.get(ayah);
                const url = `${QURAN_API}/recitations/${recitationId}/by_ayah/${surah}:${ayah}?segments=true`;
                const response = await this.fetcher(url, { cache: 'force-cache' });
                if (!response.ok) throw new Error(`Quran ayah audio HTTP ${response.status}`);
                const timing = this.parseAudioFiles(await response.json(), surah).get(ayah);
                if (!timing) throw new Error('التسجيل الصوتي لهذه الآية غير متاح.');
                return timing;
            })().catch(error => {
                this.verseCache.delete(key);
                throw error;
            });
            this.verseCache.set(key, promise);
            return promise;
        }
    }

    function defaultState() {
        return {
            version: 2,
            provider: 'quran-foundation',
            reciterId: 7,
            reciterName: 'مشاري راشد العفاسي',
            moshafId: null,
            moshafName: 'حفص عن عاصم — مزامنة دقيقة',
            server: null,
            availableSurahs: Array.from({ length: 114 }, (_, index) => index + 1),
            surah: 1,
            ayah: 1,
            position: 0,
            speed: 1,
            autoFollow: true,
            repeat: { mode: 'off', start: 1, end: 1, count: 1, completed: 0 },
            updatedAt: Date.now()
        };
    }

    function sanitizeState(input) {
        const base = defaultState();
        if (!input || typeof input !== 'object') return base;
        const state = { ...base, ...input };
        state.provider = state.provider === 'mp3quran' ? 'mp3quran' : 'quran-foundation';
        state.surah = Math.min(114, Math.max(1, Number(state.surah) || 1));
        const maxAyah = VERSE_COUNTS[state.surah - 1];
        state.ayah = Math.min(maxAyah, Math.max(1, Number(state.ayah) || 1));
        state.position = Math.max(0, Number(state.position) || 0);
        state.speed = [0.75, 1, 1.25, 1.5, 2].includes(Number(state.speed)) ? Number(state.speed) : 1;
        state.autoFollow = state.autoFollow !== false;
        const repeat = input.repeat && typeof input.repeat === 'object' ? input.repeat : {};
        const mode = ['off', 'surah', 'verse', 'range'].includes(repeat.mode) ? repeat.mode : 'off';
        state.repeat = {
            mode,
            start: Math.min(maxAyah, Math.max(1, Number(repeat.start) || state.ayah)),
            end: Math.min(maxAyah, Math.max(1, Number(repeat.end) || state.ayah)),
            count: Math.min(99, Math.max(1, Number(repeat.count) || 1)),
            completed: Math.max(0, Number(repeat.completed) || 0)
        };
        if (state.repeat.start > state.repeat.end) {
            [state.repeat.start, state.repeat.end] = [state.repeat.end, state.repeat.start];
        }
        state.availableSurahs = Array.isArray(input.availableSurahs)
            ? input.availableSurahs.filter(n => Number.isInteger(n) && n >= 1 && n <= 114)
            : base.availableSurahs;
        return state;
    }

    class AudioEngine extends EventTarget {
        constructor(audio, options = {}) {
            super();
            if (!audio) throw new Error('Audio element is required');
            this.audio = audio;
            this.timing = options.timingProvider || new TimingProvider(options.fetcher);
            this.state = sanitizeState(readJson(STATE_KEY));
            this.alignedReciters = new Map(ALIGNED_RECITERS.map(reciter => [reciter.id, reciter]));
            this.chapter = null;
            this.currentTiming = null;
            this.trackUrl = '';
            this.status = 'idle';
            this.error = '';
            this.sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            this.channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
            this.lastSave = 0;
            this.pendingResume = this.state.position;
            this.intentToPlay = false;
            this.prepareVersion = 0;
            this.nextVerseAudio = null;
            this.nextVerseVersion = 0;
            this.bindAudio();
            this.bindChannel();
            this.audio.playbackRate = this.state.speed;
            this.setupMediaSession();
        }

        snapshot() {
            return {
                ...this.state,
                repeat: { ...this.state.repeat },
                playing: !this.audio.paused,
                loading: this.status === 'loading',
                status: this.status,
                error: this.error,
                currentTime: Number(this.audio.currentTime) || 0,
                duration: Number(this.audio.duration) || 0,
                syncAvailable: this.state.provider === 'quran-foundation' && !!this.currentTiming,
                timing: this.currentTiming
            };
        }

        emit(type = 'state') {
            const detail = this.snapshot();
            this.dispatchEvent(new CustomEvent(type, { detail }));
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent(`quran-audio:${type}`, { detail }));
            }
        }

        persist() {
            this.state.position = Number(this.audio.currentTime) || 0;
            this.state.updatedAt = Date.now();
            writeJson(STATE_KEY, this.state);
        }

        bindChannel() {
            if (!this.channel) return;
            this.channel.addEventListener('message', event => {
                if (event.data?.type === 'playing' && event.data.sessionId !== this.sessionId && !this.audio.paused) {
                    this.audio.pause();
                    this.status = 'paused';
                    this.emit();
                }
            });
        }

        bindAudio() {
            // Each element keeps its own handlers. Events from a retired track
            // must never mutate the active playback state.
            const element = this.audio;
            const listen = (name, handler) => element.addEventListener(name, event => {
                if (element === this.audio) handler(event);
            });
            listen('loadstart', () => { this.status = 'loading'; this.error = ''; this.emit(); });
            listen('waiting', () => { this.status = 'loading'; this.emit(); });
            listen('playing', () => {
                this.intentToPlay = true;
                this.status = 'playing';
                this.preloadUpcomingVerse(); this.error = '';
                this.channel?.postMessage({ type: 'playing', sessionId: this.sessionId });
                this.emit();
            });
            listen('play', () => { this.status = 'playing'; this.emit(); });
            listen('pause', () => {
                if (!this.audio.ended) this.status = 'paused';
                this.persist(); this.emit();
            });
            listen('loadedmetadata', () => {
                if (this.pendingResume > 0 && Number.isFinite(this.audio.duration)) {
                    this.audio.currentTime = Math.min(this.pendingResume, Math.max(0, this.audio.duration - .25));
                }
                this.pendingResume = 0;
                this.emit();
            });
            listen('timeupdate', () => {
                const now = Date.now();
                if (now - this.lastSave > 3000) { this.lastSave = now; this.persist(); }
                if (navigator.mediaSession?.setPositionState && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
                    try {
                        navigator.mediaSession.setPositionState({
                            duration: this.audio.duration,
                            playbackRate: this.audio.playbackRate,
                            position: Math.min(this.audio.duration, Math.max(0, this.audio.currentTime))
                        });
                    } catch (_) { /* Some WebViews expose MediaSession without position state. */ }
                }
                this.emit('time');
            });
            listen('ratechange', () => this.emit());
            listen('ended', () => this.handleEnded());
            listen('error', () => {
                this.status = 'error';
                this.error = navigator.onLine === false
                    ? 'لا يوجد اتصال بالإنترنت. شغّل الإنترنت أو حمّل السورة للاستماع.'
                    : 'تعذّر تحميل التسجيل. تحقق من الإنترنت أو جرّب قارئًا آخر.';
                this.emit();
            });
        }

        clearUpcomingVerse() {
            this.nextVerseVersion++;
            const pending = this.nextVerseAudio;
            this.nextVerseAudio = null;
            if (pending?.audio && pending.audio !== this.audio) {
                pending.audio.pause();
                pending.audio.removeAttribute('src');
            }
        }

        async preloadUpcomingVerse() {
            if (this.state.provider !== 'quran-foundation') return;
            const reciterId = this.state.reciterId;
            let surah = this.state.surah;
            let ayah = this.state.ayah + 1;
            if (ayah > VERSE_COUNTS[surah - 1]) {
                if (surah === 114) return;
                surah++;
                ayah = 1;
            }
            const existing = this.nextVerseAudio;
            if (existing && existing.reciterId === reciterId &&
                existing.surah === surah && existing.ayah === ayah) return;
            this.clearUpcomingVerse();
            const version = this.nextVerseVersion;
            try {
                const timing = await this.timing.verse(reciterId, surah, ayah);
                if (version !== this.nextVerseVersion || this.state.provider !== 'quran-foundation' ||
                    this.state.reciterId !== reciterId) return;
                const audio = new Audio();
                audio.preload = 'auto';
                audio.playbackRate = this.state.speed;
                audio.src = timing.audioUrl;
                audio.load();
                this.nextVerseAudio = { audio, timing, reciterId, surah, ayah };
            } catch (_) {
                // Network failures are handled by normal on-demand playback.
            }
        }

        async prepare(options = {}) {
            const autoplay = !!options.autoplay;
            const version = ++this.prepareVersion;
            if (autoplay) this.intentToPlay = true;
            this.status = 'loading'; this.error = ''; this.currentTiming = null; this.emit();
            try {
                let url;
                if (this.state.provider === 'quran-foundation') {
                    const timing = await this.timing.verse(this.state.reciterId, this.state.surah, this.state.ayah);
                    if (version !== this.prepareVersion) return false;
                    this.currentTiming = timing;
                    url = timing.audioUrl;
                } else {
                    url = mp3Url({ server: this.state.server, surahs: this.state.availableSurahs }, this.state.surah);
                    if (!url) throw new Error('Surah is unavailable for this recording');
                }
                if (version !== this.prepareVersion) return false;
                const mediaUrl = window.QuranDownloads?.mediaFor
                    ? await window.QuranDownloads.mediaFor(this, url) : url;
                if (version !== this.prepareVersion) return false;
                const pending = this.nextVerseAudio;
                const canReuse = this.state.provider === 'quran-foundation' &&
                    pending?.reciterId === this.state.reciterId &&
                    pending.surah === this.state.surah &&
                    pending.ayah === this.state.ayah &&
                    pending.audio.src === url &&
                    pending.audio.readyState >= 2;
                if (canReuse) {
                    // The next recording was already downloaded and decoded
                    // while the current verse was playing.
                    const retired = this.audio;
                    this.audio = pending.audio;
                    this.nextVerseAudio = null;
                    this.nextVerseVersion++;
                    this.bindAudio();
                    this.audio.playbackRate = this.state.speed;
                    retired.pause();
                    retired.removeAttribute('src');
                    this.trackUrl = url;
                } else if (url !== this.trackUrl || this.audio.src !== mediaUrl) {
                    this.clearUpcomingVerse();
                    this.trackUrl = url;
                    this.audio.src = mediaUrl;
                    this.audio.load();
                }
                this.updateMediaMetadata();
                this.status = this.audio.paused ? 'ready' : 'playing';
                this.persist(); this.emit();
                if (autoplay) await this.play();
                return true;
            } catch (error) {
                if (version !== this.prepareVersion) return false;
                this.status = 'error';
                this.error = navigator.onLine === false
                    ? 'التلاوة دي مش محمّلة بالكامل على الجهاز. اتصل بالإنترنت وحمّل السورة أولًا.'
                    : error?.message === 'Failed to fetch'
                        ? 'تعذّر جلب بيانات المزامنة. تحقق من الإنترنت أو اختر تسجيل MP3Quran.'
                        : (error?.message || 'تعذّر تجهيز التلاوة.');
                this.emit();
                return false;
            }
        }

        async play() {
            this.intentToPlay = true;
            if (!this.trackUrl && !(await this.prepare())) return false;
            try {
                await this.audio.play();
                return true;
            } catch (error) {
                if (error?.name !== 'AbortError') {
                    this.status = 'error';
                    this.error = 'تعذّر بدء التشغيل. اضغط تشغيل مرة أخرى بعد التحقق من الاتصال.';
                    this.emit();
                }
                return false;
            }
        }

        pause() { this.intentToPlay = false; this.audio.pause(); }
        toggle() { return this.audio.paused ? this.play() : (this.pause(), Promise.resolve(true)); }

        seek(seconds) {
            if (!Number.isFinite(this.audio.duration)) return;
            this.audio.currentTime = Math.min(this.audio.duration, Math.max(0, Number(seconds) || 0));
            this.persist(); this.emit('time');
        }

        setSpeed(speed) {
            this.state.speed = [0.75, 1, 1.25, 1.5, 2].includes(Number(speed)) ? Number(speed) : 1;
            this.audio.playbackRate = this.state.speed;
            this.persist(); this.emit();
        }

        setAutoFollow(value) {
            this.state.autoFollow = !!value;
            this.persist(); this.emit();
        }

        setRepeat(repeat) {
            this.state.repeat = sanitizeState({ ...this.state, repeat }).repeat;
            this.persist(); this.emit();
        }

        registerAlignedReciter(reciter) {
            const id = Number(reciter?.id);
            const name = String(reciter?.name || '').trim();
            if (!Number.isSafeInteger(id) || id < 1 || id > 10000 || !name || name.length > 120) return false;
            this.alignedReciters.set(id, { id, name, label: name + ' • تظليل الكلمات' });
            return true;
        }

        async selectAligned(reciterId = 7, options = {}) {
            const reciter = this.alignedReciters.get(Number(reciterId));
            if (!reciter) return false;
            const autoplay = options.autoplay ?? (!this.audio.paused || this.intentToPlay);
            this.audio.pause();
            this.clearUpcomingVerse();
            this.trackUrl = '';
            this.state = sanitizeState({
                ...this.state,
                provider: 'quran-foundation', reciterId: reciter.id, reciterName: reciter.name,
                moshafId: null, moshafName: 'حفص عن عاصم — مزامنة دقيقة', server: null,
                availableSurahs: Array.from({ length: 114 }, (_, index) => index + 1),
                surah: Number(options.surah) || this.state.surah,
                ayah: Number(options.ayah) || 1,
                position: Number(options.position) || 0
            });
            this.pendingResume = this.state.position;
            return this.prepare({ autoplay });
        }

        async selectMp3(reciter, moshaf, options = {}) {
            if (!reciter || !moshaf || !validMp3Server(moshaf.server)) return false;
            const autoplay = options.autoplay ?? (!this.audio.paused || this.intentToPlay);
            this.audio.pause();
            this.clearUpcomingVerse();
            this.trackUrl = '';
            const requestedSurah = Number(options.surah) || this.state.surah;
            const surah = moshaf.surahs.includes(requestedSurah) ? requestedSurah : moshaf.surahs[0];
            this.state = sanitizeState({
                ...this.state,
                provider: 'mp3quran', reciterId: reciter.id, reciterName: reciter.name,
                moshafId: moshaf.id, moshafName: moshaf.name, server: moshaf.server,
                availableSurahs: [...moshaf.surahs], surah, ayah: 1,
                position: Number(options.position) || 0,
                repeat: ['off', 'surah'].includes(this.state.repeat.mode)
                    ? this.state.repeat : { mode: 'off', start: 1, end: 1, count: 1, completed: 0 }
            });
            this.pendingResume = this.state.position;
            return this.prepare({ autoplay });
        }

        async goTo(surah, ayah = 1, options = {}) {
            const autoplay = options.autoplay ?? (!this.audio.paused || this.intentToPlay);
            surah = Math.min(114, Math.max(1, Number(surah) || 1));
            ayah = Math.min(VERSE_COUNTS[surah - 1], Math.max(1, Number(ayah) || 1));
            if (this.state.provider === 'mp3quran' && !this.state.availableSurahs.includes(surah)) return false;
            const sameTrack = this.state.provider === 'mp3quran' && this.state.surah === surah;
            this.state.surah = surah;
            this.state.ayah = this.state.provider === 'quran-foundation' ? ayah : 1;
            const maxAyah = VERSE_COUNTS[surah - 1];
            this.state.repeat.start = Math.min(maxAyah, Math.max(1, this.state.repeat.start));
            this.state.repeat.end = Math.min(maxAyah, Math.max(1, this.state.repeat.end));
            if (this.state.repeat.start > this.state.repeat.end) {
                [this.state.repeat.start, this.state.repeat.end] = [this.state.repeat.end, this.state.repeat.start];
            }
            this.state.position = Number(options.position) || 0;
            if (!options.preserveRepeat) this.state.repeat.completed = 0;
            this.pendingResume = this.state.position;
            if (sameTrack) {
                this.seek(this.state.position);
                if (autoplay) await this.play();
                return true;
            }
            this.audio.pause(); this.trackUrl = '';
            return this.prepare({ autoplay });
        }

        async next(options = {}) {
            const autoplay = options.autoplay ?? (!this.audio.paused || this.intentToPlay);
            if (this.state.provider === 'quran-foundation') {
                if (this.state.ayah < VERSE_COUNTS[this.state.surah - 1]) {
                    return this.goTo(this.state.surah, this.state.ayah + 1, { autoplay });
                }
                if (this.state.surah < 114) return this.goTo(this.state.surah + 1, 1, { autoplay });
                return false;
            }
            const index = this.state.availableSurahs.indexOf(this.state.surah);
            if (index < 0 || index >= this.state.availableSurahs.length - 1) return false;
            return this.goTo(this.state.availableSurahs[index + 1], 1, { autoplay });
        }

        async previous(options = {}) {
            const autoplay = options.autoplay ?? (!this.audio.paused || this.intentToPlay);
            if (this.state.provider === 'quran-foundation') {
                if (this.audio.currentTime > 3) { this.seek(0); return true; }
                if (this.state.ayah > 1) return this.goTo(this.state.surah, this.state.ayah - 1, { autoplay });
                if (this.state.surah > 1) {
                    return this.goTo(this.state.surah - 1, VERSE_COUNTS[this.state.surah - 2], { autoplay });
                }
                return false;
            }
            if (this.audio.currentTime > 5) { this.seek(0); return true; }
            const index = this.state.availableSurahs.indexOf(this.state.surah);
            if (index <= 0) return false;
            return this.goTo(this.state.availableSurahs[index - 1], 1, { autoplay });
        }

        async handleEnded() {
            const repeat = this.state.repeat;
            if (this.state.provider === 'mp3quran') {
                if (repeat.mode === 'surah') { this.seek(0); await this.play(); }
                else await this.next({ autoplay: true });
                return;
            }
            if (repeat.mode === 'verse') {
                repeat.completed += 1;
                if (repeat.completed < repeat.count) {
                    this.trackUrl = ''; await this.prepare({ autoplay: true }); return;
                }
                // "Repeat current verse" is a finite practice action, not every next verse.
                repeat.completed = 0;
                repeat.mode = 'off';
                this.persist();
                await this.next({ autoplay: true });
                return;
            }
            if (repeat.mode === 'range') {
                if (this.state.ayah < repeat.end) {
                    await this.goTo(this.state.surah, this.state.ayah + 1, { autoplay: true, preserveRepeat: true });
                } else {
                    repeat.completed += 1;
                    if (repeat.completed < repeat.count) {
                        await this.goTo(this.state.surah, repeat.start, { autoplay: true, preserveRepeat: true });
                    } else {
                        repeat.completed = 0;
                        repeat.mode = 'off';
                        this.persist();
                        await this.next({ autoplay: true });
                    }
                }
                return;
            }
            if (repeat.mode === 'surah' && this.state.ayah >= VERSE_COUNTS[this.state.surah - 1]) {
                await this.goTo(this.state.surah, 1, { autoplay: true });
                return;
            }
            await this.next({ autoplay: true });
        }

        updateMediaMetadata() {
            if (!('mediaSession' in navigator) || typeof MediaMetadata !== 'function') return;
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: `سورة ${SURAH_NAMES[this.state.surah - 1]}` +
                        (this.state.provider === 'quran-foundation' ? ` — الآية ${this.state.ayah}` : ''),
                    artist: this.state.reciterName,
                    album: this.state.moshafName || 'القرآن الكريم'
                });
            } catch (_) { /* Optional browser integration. */ }
        }

        setupMediaSession() {
            if (!('mediaSession' in navigator)) return;
            const safe = (name, handler) => {
                try { navigator.mediaSession.setActionHandler(name, handler); } catch (_) { /* unsupported */ }
            };
            safe('play', () => this.play());
            safe('pause', () => this.pause());
            safe('previoustrack', () => this.previous());
            safe('nexttrack', () => this.next());
            safe('seekto', details => this.seek(details.seekTime));
            safe('seekbackward', details => this.seek(this.audio.currentTime - (details.seekOffset || 10)));
            safe('seekforward', details => this.seek(this.audio.currentTime + (details.seekOffset || 10)));
        }

        destroy() {
            window.QuranDownloads?.releaseMedia?.(this);
            this.clearUpcomingVerse();
            this.persist();
            this.channel?.close();
        }
    }

    const api = {
        MP3QURAN_API, QURAN_API, VERSE_AUDIO_ORIGIN, STATE_KEY, CATALOG_KEY,
        ALIGNED_RECITERS, READER_PRIORITY, SURAH_NAMES, VERSE_COUNTS,
        arabicDigits, timeText, normalizeArabic, normalizeCatalog, sortReciters,
        priorityIndex, bestMoshaf, mp3Url, CatalogService, TimingProvider,
        AudioEngine, defaultState, sanitizeState, readJson, writeJson
    };
    if (typeof window !== 'undefined') window.QuranAudio = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
