(() => {
    'use strict';

    const core = window.QuranAudio;
    const downloadsApi = window.QuranDownloads;
    const $ = id => document.getElementById(id);
    if (!core || !downloadsApi || !$('mushaf-recitation-audio')) return;

    const ui = {
        root: $('mushaf-audio-player'), audio: $('mushaf-recitation-audio'),
        open: $('audio-open-options'), close: $('audio-close-options'),
        sheet: $('audio-options-sheet'), backdrop: $('audio-options-backdrop'),
        readerName: $('audio-reader-name'), nowLabel: $('audio-now-label'),
        play: $('audio-play'), previous: $('audio-previous'), next: $('audio-next'),
        seek: $('audio-seek'), current: $('audio-current-time'), duration: $('audio-duration'),
        status: $('audio-mini-status'), syncNote: $('audio-sync-note'),
        provider: $('audio-provider'), reciter: $('audio-reciter'), moshaf: $('audio-moshaf'),
        reciterField: $('audio-reciter-field'), moshafField: $('audio-moshaf-field'),
        reciterSearch: $('audio-reciter-search'), surahSearch: $('audio-surah-search'),
        quickSpeed: $('audio-quick-speed'), speedLabel: $('audio-speed-label'),
        quickRepeat: $('audio-quick-repeat'), repeatSheet: $('audio-repeat-sheet'),
        repeatBackdrop: $('audio-repeat-backdrop'), closeRepeat: $('audio-close-repeat'),
        applyRepeatButton: $('audio-apply-repeat'), repeatHint: $('audio-repeat-hint'),
        surah: $('audio-surah'), speed: $('audio-speed'), autoFollow: $('audio-auto-follow'),
        repeatFieldset: document.querySelector('.audio-repeat-settings'),
        repeatMode: $('audio-repeat-mode'), repeatStart: $('audio-repeat-start'),
        repeatEnd: $('audio-repeat-end'), repeatCount: $('audio-repeat-count'),
        download: $('audio-download'), downloadAll: $('audio-download-all'),
        cancelDownload: $('audio-cancel-download'), downloadProgress: $('audio-download-progress'),
        downloadList: $('audio-download-list'),
        listenAction: document.querySelector('[data-verse-action="listen"]'),
        text: $('quran-text')
    };
    if (Object.values(ui).some(value => !value)) return;

    const engine = new core.AudioEngine(ui.audio);
    const catalogService = new core.CatalogService();
    const downloads = new downloadsApi.DownloadManager();
    let catalog = [];
    let activeReciter = null;
    let closeTimer = null;
    let renderedVerse = '';
    let renderedWord = null;
    let applyingState = false;
    let downloadBatch = false;
    let cancelRequested = false;
    const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

    window.quranAudioEngine = engine;

    function openOptions() {
        clearTimeout(closeTimer);
        ui.backdrop.hidden = false;
        ui.sheet.classList.add('is-open');
        ui.sheet.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => ui.backdrop.classList.add('is-open'));
        renderDownloads();
    }

    function closeOptions() {
        if (!ui.sheet.classList.contains('is-open')) return;
        ui.sheet.classList.remove('is-open');
        ui.sheet.setAttribute('aria-hidden', 'true');
        ui.backdrop.classList.remove('is-open');
        closeTimer = setTimeout(() => { ui.backdrop.hidden = true; }, 240);
    }

    function option(select, value, label) {
        const item = document.createElement('option');
        item.value = String(value);
        item.textContent = label;
        select.appendChild(item);
    }

    function fillSurahs(state) {
        const available = state.provider === 'mp3quran' ? state.availableSurahs :
            Array.from({ length: 114 }, (_, index) => index + 1);
        const search = core.normalizeArabic(ui.surahSearch.value);
        ui.surah.replaceChildren();
        available.filter(number => !search ||
            core.normalizeArabic(core.SURAH_NAMES[number - 1]).includes(search) ||
            String(number).includes(search) || number === state.surah)
            .forEach(number => option(ui.surah, number,
                `${core.arabicDigits(number)}. سورة ${core.SURAH_NAMES[number - 1]}`));
        ui.surah.value = String(state.surah);
    }

    function fillReciters(state) {
        const search = core.normalizeArabic(ui.reciterSearch.value);
        ui.reciter.replaceChildren();
        const alignedName = 'مشاري راشد العفاسي • تظليل الكلمات';
        const selectedValue = state.provider === 'quran-foundation' ? 'aligned:7' : `mp3:${state.reciterId}`;
        if (!search || core.normalizeArabic(alignedName).includes(search) || selectedValue === 'aligned:7') {
            option(ui.reciter, 'aligned:7', alignedName);
        }
        catalog.filter(reciter => !search || core.normalizeArabic(reciter.name).includes(search) ||
            selectedValue === `mp3:${reciter.id}`)
            .forEach(reciter => option(ui.reciter, `mp3:${reciter.id}`, reciter.name));
        ui.reciter.value = selectedValue;
        if (!ui.reciter.value) ui.reciter.selectedIndex = 0;
        const selected = catalog.find(reciter => reciter.id === Number(state.reciterId)) ||
            catalogService.preferred(catalog);
        fillMoshaf(selected, state.moshafId);
    }

    function fillMoshaf(reciter, selectedId) {
        activeReciter = reciter || null;
        ui.moshaf.replaceChildren();
        if (!reciter) return;
        reciter.moshaf.forEach(moshaf => option(ui.moshaf, moshaf.id,
            `${moshaf.name} (${core.arabicDigits(moshaf.surahs.length)} سورة${moshaf.complete ? ' • كامل' : ''})`));
        const selected = reciter.moshaf.find(item => item.id === Number(selectedId)) || core.bestMoshaf(reciter);
        if (selected) ui.moshaf.value = String(selected.id);
    }

    function repeatClasses(mode) {
        ui.repeatFieldset.classList.toggle('is-simple', mode === 'off' || mode === 'surah');
        ui.repeatFieldset.classList.toggle('is-verse', mode === 'verse');
    }

    function updatePlayIcon(playing, loading) {
        ui.play.setAttribute('aria-label', loading ? 'جاري التحميل' : (playing ? 'إيقاف مؤقت' : 'تشغيل'));
        const svg = ui.play.querySelector('svg');
        svg.innerHTML = loading
            ? '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="28 18"/>'
            : playing
            ? '<path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" stroke="none"/>'
            : '<path class="audio-play-glyph" d="m8 5 11 7-11 7V5Z"/>';
    }

    function statusText(state) {
        if (state.error) return state.error;
        if (state.loading) return 'جاري تحميل التلاوة…';
        if (state.playing) {
            return state.provider === 'quran-foundation'
                ? `سورة ${core.SURAH_NAMES[state.surah - 1]} • الآية ${core.arabicDigits(state.ayah)}`
                : `سورة ${core.SURAH_NAMES[state.surah - 1]}`;
        }
        if (state.status === 'paused') return 'متوقف مؤقتًا';
        return 'جاهز للتشغيل';
    }

    function applyState(state, full = true) {
        applyingState = true;
        ui.root.classList.toggle('is-loading', state.loading);
        ui.readerName.textContent = state.reciterName;
        ui.nowLabel.textContent = state.provider === 'quran-foundation' ? 'تسجيل متزامن' : state.moshafName;
        ui.status.textContent = statusText(state);
        ui.current.textContent = core.timeText(state.currentTime);
        ui.duration.textContent = core.timeText(state.duration);
        ui.seek.disabled = !Number.isFinite(state.duration) || state.duration <= 0;
        ui.seek.value = state.duration > 0 ? String(Math.round(state.currentTime / state.duration * 1000)) : '0';
        updatePlayIcon(state.playing, state.loading);
        if (full) {
            ui.provider.value = state.provider;
            ui.reciterField.hidden = false;
            ui.moshafField.hidden = state.provider !== 'mp3quran';
            ui.speed.value = String(state.speed);
            ui.autoFollow.checked = state.autoFollow;
            ui.repeatMode.value = state.repeat.mode;
            ui.repeatStart.value = String(state.repeat.start);
            ui.repeatEnd.value = String(state.repeat.end);
            ui.repeatCount.value = String(state.repeat.count);
            const max = core.VERSE_COUNTS[state.surah - 1];
            ui.repeatStart.max = ui.repeatEnd.max = String(max);
            repeatClasses(state.repeat.mode);
            [...ui.repeatMode.options].forEach(item => {
                item.disabled = state.provider === 'mp3quran' && ['verse', 'range'].includes(item.value);
            });
            fillSurahs(state);
            ui.surah.value = String(state.surah);
            fillReciters(state);
            ui.speedLabel.textContent = `${state.speed}×`;
            ui.quickRepeat.setAttribute('aria-pressed', String(state.repeat.mode !== 'off'));
            ui.repeatHint.textContent = state.provider === 'mp3quran'
                ? 'التسجيل الحالي سورة كاملة؛ تكرار آية أو نطاق يحتاج تسجيلًا متزامنًا. اختر مشاري العفاسي المتزامن من قائمة القرّاء.'
                : 'تكرار الآية يعيد الآية المحددة. تكرار النطاق يعيد الآيات من البداية للنهاية حسب عدد المرات.';
            ui.syncNote.classList.toggle('is-unavailable', state.provider !== 'quran-foundation');
            ui.syncNote.textContent = state.provider === 'quran-foundation'
                ? 'المزامنة الدقيقة مفعّلة: توقيت الكلمة مأخوذ من ملف التسجيل نفسه عبر Quran Foundation. تُعطّل الكلمة تلقائيًا إذا لم يتطابق عدد كلمات الآية.'
                : 'هذا تسجيل سورة كاملة من MP3Quran ولا تتوفر له توقيتات كلمات مطابقة. سيعمل الصوت دون تظليل زائف، ويظل تكرار السورة متاحًا.';
        }
        applyingState = false;
    }

    function clearHighlights() {
        ui.text.querySelectorAll('.audio-verse-band').forEach(element => element.remove());
        ui.text.querySelectorAll('.mushaf-word.is-audio-word').forEach(element => element.classList.remove('is-audio-word'));
        renderedVerse = '';
        renderedWord = null;
    }

    function drawVerseBand(verseKey) {
        ui.text.querySelectorAll('.audio-verse-band').forEach(element => element.remove());
        const rows = new Map();
        ui.text.querySelectorAll(`.mushaf-word[data-verse="${verseKey}"]`).forEach(word => {
            const row = word.closest('.mushaf-line, .surah-basmala');
            if (!row) return;
            if (!rows.has(row)) rows.set(row, []);
            rows.get(row).push(word);
        });
        rows.forEach((words, row) => {
            const rowRect = row.getBoundingClientRect();
            const boxes = words.map(word => word.getBoundingClientRect());
            const lastGroup = words.at(-1).closest('.ayah-end-group');
            if (lastGroup) boxes.push(lastGroup.getBoundingClientRect());
            const band = document.createElement('span');
            band.className = 'audio-verse-band';
            band.setAttribute('aria-hidden', 'true');
            const left = Math.min(...boxes.map(box => box.left));
            const right = Math.max(...boxes.map(box => box.right));
            const top = Math.min(...boxes.map(box => box.top));
            const bottom = Math.max(...boxes.map(box => box.bottom));
            Object.assign(band.style, {
                left: `${left - rowRect.left}px`, top: `${top - rowRect.top}px`,
                width: `${right - left}px`, height: `${bottom - top}px`
            });
            row.appendChild(band);
        });
        renderedVerse = verseKey;
    }

    function syncHighlight(state) {
        if (!state.playing || state.provider !== 'quran-foundation' || !state.timing) {
            clearHighlights();
            return;
        }
        const verseKey = `${state.surah}:${state.ayah}`;
        const words = [...ui.text.querySelectorAll(`.mushaf-word[data-verse="${verseKey}"]`)];
        if (!words.length) return;
        if (renderedVerse !== verseKey) drawVerseBand(verseKey);
        const segments = state.timing.segments || [];
        const maxWord = segments.reduce((max, segment) => Math.max(max, segment.word), 0);
        const canMapWords = maxWord > 0 && maxWord === words.length;
        const milliseconds = state.currentTime * 1000;
        const segment = canMapWords
            ? segments.find(item => milliseconds >= item.start && milliseconds < item.end)
            : null;
        const nextWord = segment?.word || null;
        if (nextWord === renderedWord) return;
        words.forEach(word => word.classList.remove('is-audio-word'));
        if (nextWord) words[nextWord - 1]?.classList.add('is-audio-word');
        renderedWord = nextWord;
    }

    function followVerse(state) {
        if (!state.playing || !state.autoFollow || state.provider !== 'quran-foundation') return;
        const reader = window.mushafReader;
        const page = reader?.findVersePage(state.surah, state.ayah);
        if (page && reader.getCurrentPage() !== page) reader.goToVerse(state.surah, state.ayah, page);
    }

    engine.addEventListener('state', event => {
        const state = event.detail;
        applyState(state, true);
        followVerse(state);
        requestAnimationFrame(() => syncHighlight(state));
    });
    engine.addEventListener('time', event => {
        applyState(event.detail, false);
        syncHighlight(event.detail);
    });

    ui.open.addEventListener('click', openOptions);
    function openRepeat() {
        closeOptions();
        ui.repeatBackdrop.hidden = false;
        ui.repeatSheet.hidden = false;
        ui.repeatSheet.setAttribute('aria-hidden', 'false');
    }
    function closeRepeat() {
        ui.repeatBackdrop.hidden = true;
        ui.repeatSheet.hidden = true;
        ui.repeatSheet.setAttribute('aria-hidden', 'true');
    }
    ui.quickRepeat.addEventListener('click', openRepeat);
    ui.closeRepeat.addEventListener('click', closeRepeat);
    ui.repeatBackdrop.addEventListener('click', closeRepeat);
    ui.quickSpeed.addEventListener('click', () => {
        const next = SPEEDS[(SPEEDS.indexOf(engine.state.speed) + 1) % SPEEDS.length];
        engine.setSpeed(next);
    });
    ui.reciterSearch.addEventListener('input', () => fillReciters(engine.snapshot()));
    ui.surahSearch.addEventListener('input', () => fillSurahs(engine.snapshot()));
    ui.close.addEventListener('click', closeOptions);
    ui.backdrop.addEventListener('click', closeOptions);
    ui.play.addEventListener('click', () => engine.toggle());
    ui.previous.addEventListener('click', () => engine.previous());
    ui.next.addEventListener('click', () => engine.next());
    ui.seek.addEventListener('input', () => {
        const state = engine.snapshot();
        if (state.duration > 0) ui.current.textContent = core.timeText(Number(ui.seek.value) / 1000 * state.duration);
    });
    ui.seek.addEventListener('change', () => {
        const state = engine.snapshot();
        if (state.duration > 0) engine.seek(Number(ui.seek.value) / 1000 * state.duration);
    });

    ui.provider.addEventListener('change', async () => {
        if (applyingState) return;
        if (ui.provider.value === 'quran-foundation') {
            await engine.selectAligned(7, { surah: Number(ui.surah.value) || 1, ayah: 1 });
        } else {
            const reciter = catalog.find(item => item.id === Number(ui.reciter.value)) || catalogService.preferred(catalog);
            const moshaf = reciter?.moshaf.find(item => item.id === Number(ui.moshaf.value)) || core.bestMoshaf(reciter);
            if (reciter && moshaf) await engine.selectMp3(reciter, moshaf, { surah: Number(ui.surah.value) || 1 });
            else {
                ui.syncNote.classList.add('is-unavailable');
                ui.syncNote.textContent = 'تعذّر تحميل مكتبة MP3Quran حاليًا. أعد المحاولة عند توفر الإنترنت.';
            }
        }
    });
    ui.reciter.addEventListener('change', async () => {
        const value = ui.reciter.value;
        const wasPlaying = !engine.audio.paused;
        if (value === 'aligned:7') {
            await engine.selectAligned(7, { surah: Number(ui.surah.value) || 1, ayah: 1, autoplay: wasPlaying });
            return;
        }
        const reciter = catalog.find(item => item.id === Number(value.replace('mp3:', '')));
        if (!reciter) return;
        const moshaf = core.bestMoshaf(reciter);
        if (moshaf) await engine.selectMp3(reciter, moshaf, { surah: Number(ui.surah.value) || 1, autoplay: wasPlaying });
    });
    ui.moshaf.addEventListener('change', async () => {
        if (applyingState || !activeReciter) return;
        const moshaf = activeReciter.moshaf.find(item => item.id === Number(ui.moshaf.value));
        if (moshaf) await engine.selectMp3(activeReciter, moshaf, { surah: Number(ui.surah.value) || 1, autoplay: !engine.audio.paused });
    });
    ui.surah.addEventListener('change', () => engine.goTo(Number(ui.surah.value), 1, { autoplay: !engine.audio.paused }));
    ui.speed.addEventListener('change', () => engine.setSpeed(ui.speed.value));
    ui.autoFollow.addEventListener('change', () => engine.setAutoFollow(ui.autoFollow.checked));

    function applyRepeat() {
        const mode = ui.repeatMode.value;
        if (engine.state.provider === 'mp3quran' && ['verse', 'range'].includes(mode)) {
            ui.repeatHint.textContent = 'تكرار الآية أو نطاق الآيات يحتاج تسجيلًا متزامنًا. اختر مشاري العفاسي المتزامن من القرّاء.';
            return;
        }
        engine.setRepeat({
            mode, start: Number(ui.repeatStart.value), end: Number(ui.repeatEnd.value),
            count: Number(ui.repeatCount.value), completed: 0
        });
        repeatClasses(mode);
        if (mode === 'range' &&
            (engine.state.ayah < Number(ui.repeatStart.value) || engine.state.ayah > Number(ui.repeatEnd.value))) {
            engine.goTo(engine.state.surah, Number(ui.repeatStart.value), { autoplay: !engine.audio.paused });
        }
    }
    ui.repeatMode.addEventListener('change', () => repeatClasses(ui.repeatMode.value));
    ui.applyRepeatButton.addEventListener('click', () => {
        applyRepeat();
        if (engine.state.repeat.mode === ui.repeatMode.value) closeRepeat();
    });

    ui.listenAction.addEventListener('click', async () => {
        const selected = window.mushafVerseActions?.getSelectedVerse?.();
        if (!selected) return;
        window.mushafVerseActions.close();
        if (engine.state.provider === 'quran-foundation') {
            await engine.goTo(selected.surah, selected.ayah, { autoplay: true });
        } else {
            const started = await engine.goTo(selected.surah, 1, { autoplay: true });
            ui.status.textContent = started
                ? 'بدأت السورة؛ التوقيت الدقيق لهذه التلاوة غير متاح.'
                : 'السورة المحددة غير موجودة في هذا التسجيل.';
        }
    });

    window.addEventListener('mushaf:page-ready', () => {
        renderedVerse = '';
        requestAnimationFrame(() => syncHighlight(engine.snapshot()));
    });

    function currentTrack(state, timing = state.timing) {
        const url = state.provider === 'quran-foundation' ? timing?.audioUrl :
            core.mp3Url({ server: state.server, surahs: state.availableSurahs }, state.surah);
        return url ? {
            url, provider: state.provider, reciterId: state.reciterId,
            reciterName: state.reciterName, surah: state.surah,
            surahName: core.SURAH_NAMES[state.surah - 1],
            ayah: state.provider === 'quran-foundation' ? timing?.ayah : null
        } : null;
    }

    async function downloadCurrentSurah() {
        if (downloadBatch) return;
        downloadBatch = true;
        ui.download.disabled = true;
        const state = engine.snapshot();
        try {
            let tracks;
            if (state.provider === 'quran-foundation') {
                ui.downloadProgress.textContent = 'جاري تجهيز ملفات السورة للتنزيل…';
                const chapter = await engine.timing.chapter(state.reciterId, state.surah);
                tracks = [...chapter.values()].map(timing => currentTrack(state, timing)).filter(Boolean);
            } else {
                tracks = [currentTrack(state)].filter(Boolean);
            }
            if (!tracks.length) throw new Error('لا يوجد ملف متاح للتنزيل.');
            for (let index = 0; index < tracks.length; index++) {
                ui.downloadProgress.textContent = `تنزيل ${core.arabicDigits(index + 1)} من ${core.arabicDigits(tracks.length)}…`;
                if (!(await downloads.has(tracks[index].url))) await downloads.downloadTrack(tracks[index]);
            }
            ui.downloadProgress.textContent = `اكتمل تنزيل سورة ${core.SURAH_NAMES[state.surah - 1]} للاستماع دون إنترنت.`;
        } catch (error) {
            ui.downloadProgress.textContent = error.message || 'تعذّر تنزيل التلاوة.';
        } finally {
            downloadBatch = false;
            ui.download.disabled = false;
            renderDownloads();
        }
    }
    ui.download.addEventListener('click', downloadCurrentSurah);

    function renderDownloads() {
        const groups = new Map();
        downloads.list().forEach(item => {
            const key = `${item.provider}:${item.reciterId}:${item.surah}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        });
        const fragment = document.createDocumentFragment();
        groups.forEach(items => {
            const row = document.createElement('div');
            row.className = 'audio-download-item';
            const bytes = items.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
            const label = document.createElement('span');
            label.textContent = `${items[0].reciterName} • سورة ${items[0].surahName} • ${downloadsApi.humanSize(bytes)}`;
            const remove = document.createElement('button');
            remove.type = 'button'; remove.textContent = 'حذف';
            remove.addEventListener('click', async () => {
                remove.disabled = true;
                await Promise.all(items.map(item => downloads.remove(item.url)));
                renderDownloads();
            });
            row.append(label, remove); fragment.appendChild(row);
        });
        ui.downloadList.replaceChildren(fragment);
    }

    downloads.addEventListener('change', event => {
        const detail = event.detail;
        if (detail.status === 'downloading' && detail.total) {
            ui.downloadProgress.textContent = `تم تنزيل ${Math.round(detail.progress * 100)}٪ من الملف الحالي`;
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (ui.sheet.classList.contains('is-open')) closeOptions();
        closeRepeat();
    });
    window.addEventListener('pagehide', () => engine.destroy());

    async function loadCatalog() {
        catalog = catalogService.cached();
        if (catalog.length) fillReciters(engine.state);
        try {
            catalog = await catalogService.load();
            fillReciters(engine.state);
        } catch (_) {
            if (!catalog.length) {
                ui.reciter.replaceChildren(new Option('تعذّر تحميل القرّاء', ''));
                ui.reciter.disabled = true; ui.moshaf.disabled = true;
            }
        }
    }

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('./sw.js').catch(() => { /* Offline remains optional. */ });
    }
    applyState(engine.snapshot(), true);
    loadCatalog();
})();
