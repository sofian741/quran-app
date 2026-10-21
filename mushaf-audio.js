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
        downloadList: $('audio-download-list'), storageInfo: $('audio-storage-info'),
        listenAction: document.querySelector('[data-verse-action="listen"]'),
        switchNotice: $('audio-switch-notice'),
        switchNoticeTitle: $('audio-switch-notice-title'),
        switchNoticeMessage: $('audio-switch-notice-message'),
        switchNoticeDismiss: $('audio-switch-notice-dismiss'),
        text: $('quran-text')
    };
    if (Object.values(ui).some(value => !value)) return;

    const engine = new core.AudioEngine(ui.audio);
    const catalogService = new core.CatalogService();
    const downloads = new downloadsApi.DownloadManager();
    let catalog = [];
    const ALIGNED_CACHE_KEY = 'quranAlignedRecitersV1';
    const MAX_ALIGNED = 35;
    const alignedReciters = [...core.ALIGNED_RECITERS];
    let lastAlignedId = engine.state.provider === 'quran-foundation' ? engine.state.reciterId : 7;
    let alignedDiscoveryStatus = `${core.arabicDigits(core.ALIGNED_RECITERS.length)} قارئًا متزامنًا من QUD وQuran Foundation. آيتان فقط من القراء الجدد لهما تظليل آية دون كلمات لعدم وجود توقيتات كلمات أصلية.`;
    let activeReciter = null;
    let closeTimer = null;
    let renderedVerse = '';
    let renderedWord = null;
    let highlightedWords = [];
    let activeWordElement = null;
    let activeWordElements = [];
    let highlightFrame = 0;
    let applyingState = false;
    let listenNotice = '';
    let listenNoticeUntil = 0;
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
        refreshStorage();
    }

    function closeOptions() {
        closePickers();
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
        ui.surah.replaceChildren();
        available.forEach(number => option(ui.surah, number,
            `${core.arabicDigits(number)}. سورة ${core.SURAH_NAMES[number - 1]}`));
        ui.surah.value = String(state.surah);
        updatePicker('surah');
    }

    function fillReciters(state) {
        ui.reciter.replaceChildren();
        const selectedValue = state.provider === 'quran-foundation' ?
            `aligned:${state.reciterId}` : `mp3:${state.reciterId}`;

        const syncedGroup = document.createElement('optgroup');
        syncedGroup.label = `القراء المتزامنون (${core.arabicDigits(alignedReciters.length)}) • تشغيل من أي آية + تظليل الكلمات`;
        alignedReciters.forEach(reciter => option(syncedGroup,
            `aligned:${reciter.id}`, reciter.label || `${reciter.name} • تظليل الكلمات`));
        ui.reciter.appendChild(syncedGroup);

        const mp3Group = document.createElement('optgroup');
        mp3Group.label = `مكتبة التلاوات (${core.arabicDigits(catalog.length)}) • تسجيلات غير متزامنة`;
        catalog.forEach(reciter => option(mp3Group,
            `mp3:${reciter.id}`, `${reciter.name} • يبدأ التسجيل من بدايته`));
        if (state.provider === 'mp3quran' && !catalog.some(item => item.id === Number(state.reciterId))) {
            option(mp3Group, selectedValue,
                `${state.reciterName} • تسجيل غير متزامن`);
        }
        if (mp3Group.children.length) ui.reciter.appendChild(mp3Group);

        ui.reciter.value = selectedValue;
        if (!ui.reciter.value) ui.reciter.selectedIndex = 0;
        const selected = catalog.find(reciter => reciter.id === Number(state.reciterId)) ||
            catalogService.preferred(catalog);
        fillMoshaf(selected, state.moshafId);
        updatePicker('reciter');
    }

    function fillMoshaf(reciter, selectedId) {
        activeReciter = reciter || null;
        ui.moshaf.replaceChildren();
        if (!reciter) { updatePicker('moshaf'); return; }
        reciter.moshaf.forEach(moshaf => option(ui.moshaf, moshaf.id,
            `${moshaf.name} (${core.arabicDigits(moshaf.surahs.length)} سورة${moshaf.complete ? ' • كامل' : ''})`));
        const selected = reciter.moshaf.find(item => item.id === Number(selectedId)) || core.bestMoshaf(reciter);
        if (selected) ui.moshaf.value = String(selected.id);
        updatePicker('moshaf');
    }

    const pickerConfig = {
        reciter: { select: ui.reciter, trigger: $('audio-reciter-trigger'),
            label: $('audio-reciter-selected'), panel: $('audio-reciter-panel'),
            search: ui.reciterSearch, results: $('audio-reciter-results') },
        moshaf: { select: ui.moshaf, trigger: $('audio-moshaf-trigger'),
            label: $('audio-moshaf-selected'), panel: $('audio-moshaf-panel'),
            search: null, results: $('audio-moshaf-results') },
        surah: { select: ui.surah, trigger: $('audio-surah-trigger'),
            label: $('audio-surah-selected'), panel: $('audio-surah-panel'),
            search: ui.surahSearch, results: $('audio-surah-results') },
        repeat: { select: ui.repeatMode, trigger: $('audio-repeat-mode-trigger'),
            label: $('audio-repeat-mode-selected'), panel: $('audio-repeat-mode-panel'),
            search: null, results: $('audio-repeat-mode-results') }
    };

    function updatePicker(kind) {
        const picker = pickerConfig[kind];
        const chosen = [...picker.select.options].find(item => item.value === picker.select.value);
        picker.label.textContent = chosen?.textContent || 'اختر من القائمة';
        if (!picker.panel.hidden) renderPicker(kind);
    }

    function renderPicker(kind) {
        const picker = pickerConfig[kind];
        const search = core.normalizeArabic(picker.search?.value || '');
        const options = [...picker.select.options].filter(item =>
            !search || core.normalizeArabic(item.textContent).includes(search) ||
            String(item.value).includes(search));
        const fragment = document.createDocumentFragment();
        let lastGroup = null;
        options.forEach(item => {
            if (kind === 'reciter') {
                const group = item.parentElement?.tagName === 'OPTGROUP' ? item.parentElement : null;
                if (group !== lastGroup) {
                    lastGroup = group;
                    const heading = document.createElement('div');
                    heading.className = 'audio-picker-group-heading' +
                        (group?.label.startsWith('مكتبة التلاوات') ? ' audio-picker-group-mp3' : '');
                    heading.textContent = group?.label || 'القراء';
                    fragment.appendChild(heading);
                    if (group?.label.startsWith('مكتبة التلاوات')) {
                        const caption = document.createElement('small');
                        caption.className = 'audio-picker-group-caption';
                        caption.textContent = 'لا يوجد تظليل كلمات أو تشغيل من آية محددة. عند اختيار آية للاستماع، سيتم التحويل تلقائيًا إلى مشاري العفاسي مع تنبيه واضح.';
                        fragment.appendChild(caption);
                    }
                }
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'audio-picker-option';
            button.textContent = item.textContent;
            button.dataset.value = item.value;
            button.setAttribute('aria-current', String(item.value === picker.select.value));
            button.addEventListener('click', () => {
                if (picker.select.value !== item.value) {
                    picker.select.value = item.value;
                    picker.select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                updatePicker(kind);
                closePickers();
                picker.trigger.focus({ preventScroll: true });
            });
            fragment.appendChild(button);
        });
        if (!options.length) {
            const empty = document.createElement('p');
            empty.className = 'audio-picker-empty';
            empty.textContent = 'لا توجد نتائج. جرّب اسمًا آخر.';
            fragment.appendChild(empty);
        }
        picker.results.replaceChildren(fragment);
    }

    function closePickers() {
        Object.values(pickerConfig).forEach(picker => {
            picker.panel.hidden = true;
            picker.trigger.setAttribute('aria-expanded', 'false');
        });
    }

    Object.entries(pickerConfig).forEach(([kind, picker]) => {
        picker.trigger.addEventListener('click', () => {
            const opening = picker.panel.hidden;
            closePickers();
            if (!opening) return;
            picker.panel.hidden = false;
            picker.trigger.setAttribute('aria-expanded', 'true');
            if (picker.search) picker.search.value = '';
            renderPicker(kind);
            if (picker.search) picker.search.focus({ preventScroll: true });
        });
        picker.search?.addEventListener('input', () => renderPicker(kind));
    });

    // Close the open list when tapping elsewhere, without swallowing selection clicks.
    document.addEventListener('pointerdown', event => {
        if (!event.target.closest('.audio-picker')) closePickers();
    });

    function repeatClasses(mode) {
        ui.repeatFieldset.classList.toggle('is-simple', mode === 'off' || mode === 'surah');
        ui.repeatFieldset.classList.toggle('is-verse', mode === 'verse');
        updatePicker('repeat');
    }
    // A touch-friendly numeric stepper instead of the browser's tiny number spinners.
    ui.repeatFieldset.addEventListener('click', event => {
        const button = event.target.closest('[data-audio-step]');
        if (!button) return;
        const [id, deltaText] = button.dataset.audioStep.split(':');
        const input = $(id);
        if (!input) return;
        const delta = Number(deltaText);
        const min = Number(input.min) || 1;
        const max = Number(input.max) || (id === 'audio-repeat-count' ? 99 :
            core.VERSE_COUNTS[engine.state.surah - 1]);
        input.value = String(Math.min(max, Math.max(min, (Number(input.value) || min) + delta)));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });

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
        ui.status.textContent = listenNotice && Date.now() < listenNoticeUntil
            ? listenNotice : statusText(state);
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
            // Fine-grained repeat is always selectable; applying it can switch to
            // the aligned recording because full-surah MP3s have no verse timings.
            fillSurahs(state);
            ui.surah.value = String(state.surah);
            fillReciters(state);
            ui.speedLabel.textContent = `${state.speed}×`;
            ui.downloadAll.textContent = state.availableSurahs.length === 114
                ? 'تحميل المصحف الصوتي كاملًا'
                : `تحميل كل التلاوات المتاحة (${core.arabicDigits(state.availableSurahs.length)} سورة)`;
            ui.quickRepeat.setAttribute('aria-pressed', String(state.repeat.mode !== 'off'));
            ui.repeatHint.textContent = state.provider === 'mp3quran'
                ? 'تكرار الآية أو نطاق الآيات يحتاج نسخة متزامنة من القارئ نفسه؛ لن يتم تبديل الشيخ تلقائيًا.'
                : 'تكرار الآية يعيد الآية الحالية، وتكرار النطاق يعيد الآيات من البداية للنهاية بعدد المرات المحدد.';
            ui.syncNote.classList.toggle('is-unavailable', state.provider !== 'quran-foundation');
            ui.syncNote.textContent = state.provider === 'quran-foundation'
                ? alignedDiscoveryStatus
                : 'القارئ الحالي من مكتبة التلاوات غير المتزامنة: يبدأ التسجيل من بدايته، ولا يدعم تظليل الكلمات أو التشغيل من آية محددة. عند الضغط على «الاستماع» لآية، سيتحول التطبيق تلقائيًا إلى مشاري العفاسي مع تنبيه واضح.';
        }
        applyingState = false;
    }

    function clearHighlights() {
        ui.text.querySelectorAll('.audio-verse-band').forEach(element => element.remove());
        activeWordElements.forEach(element => element.classList.remove('is-audio-word'));
        activeWordElements = [];
        if (activeWordElement) activeWordElement.classList.remove('is-audio-word');
        // A page change can detach the previous active word from the reader.
        ui.text.querySelectorAll('.mushaf-word.is-audio-word').forEach(element => element.classList.remove('is-audio-word'));
        renderedVerse = '';
        renderedWord = null;
        highlightedWords = [];
        activeWordElement = null;
    }

    function spokenVerseWords(verseKey) {
        const surah = Number(verseKey.split(':')[0]);
        const words = [...ui.text.querySelectorAll(`.mushaf-word[data-verse="${verseKey}"]`)];
        // The printed basmala is part of the mushaf layout, but for every
        // surah except Al-Fatihah it is not part of this reciter's aligned
        // first-ayah recording. Do not count or highlight its words.
        if (surah === 1) return words;
        return words.filter(word => !word.closest('.surah-basmala'));
    }

    function drawVerseBand(verseKey) {
        ui.text.querySelectorAll('.audio-verse-band').forEach(element => element.remove());
        const rows = new Map();
        spokenVerseWords(verseKey).forEach(word => {
            const row = word.closest('.mushaf-line, .surah-basmala');
            if (!row) return;
            if (!rows.has(row)) rows.set(row, []);
            rows.get(row).push(word);
        });
        rows.forEach((words, row) => {
            const rowRect = row.getBoundingClientRect();
            const boxes = words.map(word => word.getBoundingClientRect());
            // Match the long-press verse selection exactly, including the ayah
            // ornament only when it belongs to the last word of this verse.
            const lastWord = words[words.length - 1];
            const marker = lastWord.closest('.ayah-end-group');
            if (marker && marker.contains(lastWord)) boxes.push(marker.getBoundingClientRect());
            const left = Math.min(...boxes.map(box => box.left));
            const right = Math.max(...boxes.map(box => box.right));
            const top = Math.min(...boxes.map(box => box.top));
            const bottom = Math.max(...boxes.map(box => box.bottom));
            // Reader lines are scaled to fit the phone. Convert viewport
            // coordinates back into the row's local coordinate system.
            const scaleX = rowRect.width / Math.max(1, row.offsetWidth);
            const scaleY = rowRect.height / Math.max(1, row.offsetHeight);
            const band = document.createElement('span');
            band.className = 'audio-verse-band';
            band.setAttribute('aria-hidden', 'true');
            Object.assign(band.style, {
                left: `${(left - rowRect.left) / scaleX}px`,
                top: `${(top - rowRect.top) / scaleY}px`,
                width: `${(right - left) / scaleX}px`,
                height: `${(bottom - top) / scaleY}px`
            });
            row.appendChild(band);
        });
        renderedVerse = verseKey;
    }

    function syncHighlight(state) {
        if (!state.playing || state.provider !== 'quran-foundation' || !state.timing) {
            if (renderedVerse || activeWordElement) clearHighlights();
            return;
        }

        const verseKey = `${state.surah}:${state.ayah}`;
        if (renderedVerse !== verseKey) {
            // Remove the previous verse's word cue immediately, even if the
            // next verse is on a page that has not finished rendering.
            activeWordElements.forEach(element => element.classList.remove('is-audio-word'));
            activeWordElements = [];
            if (activeWordElement) activeWordElement.classList.remove('is-audio-word');
            activeWordElement = null;
            renderedWord = null;
            highlightedWords = spokenVerseWords(verseKey);
            if (!highlightedWords.length) {
                clearHighlights();
                return;
            }
            drawVerseBand(verseKey);
        }

        const segments = state.timing.segments || [];
        const count = highlightedWords.length;
        // Timing providers can omit punctuation or a word segment. Keep the
        // available real word cues instead of disabling the entire verse.
        const indices = segments.map(item => item.word).filter(Number.isInteger);
        const firstIndex = indices.length ? Math.min(...indices) : -1;
        const lastIndex = indices.length ? Math.max(...indices) : -1;
        const zeroBased = firstIndex === 0;
        const validMapping = count > 0 && indices.length > 0 &&
            firstIndex >= 0 && lastIndex <= (zeroBased ? count - 1 : count);
        const milliseconds = state.currentTime * 1000;
        const verseStart = Number(state.timing.timestampFrom);
        const verseEnd = Number(state.timing.timestampTo);
        let nextWord = null;
        let nextWordEnd = null;

        if (validMapping &&
            (!Number.isFinite(verseStart) || milliseconds >= verseStart) &&
            (!Number.isFinite(verseEnd) || milliseconds < verseEnd)) {
            // Keep the previous word active through tiny gaps in the timing
            // metadata, but never leave the final word stuck after it ends.
            const first = segments[0];
            const last = segments[segments.length - 1];
            if (milliseconds < first.start) {
                // Some recordings omit the first word's segment.
                nextWord = 1;
                nextWordEnd = 1;
            } else if (milliseconds <= last.end + 60) {
                for (let index = segments.length - 1; index >= 0; index--) {
                    if (milliseconds >= segments[index].start) {
                        nextWord = segments[index].word + (zeroBased ? 1 : 0);
                        // Original alignment may group adjacent words that
                        // were acoustically inseparable: highlight the group
                        // together, never invent intermediate word timings.
                        nextWordEnd = Number(segments[index].endWord) || nextWord;
                        break;
                    }
                }
            }
        }

        const nextRange = nextWord ? `${nextWord}:${nextWordEnd || nextWord}` : null;
        if (nextRange === renderedWord) return;
        activeWordElements.forEach(element => element.classList.remove('is-audio-word'));
        activeWordElements = [];
        if (nextWord) {
            for (let i = nextWord; i <= Math.min(count, nextWordEnd || nextWord); i++) {
                const element = highlightedWords[i - 1];
                if (element) { element.classList.add('is-audio-word'); activeWordElements.push(element); }
            }
        }
        activeWordElement = activeWordElements[0] || null;
        renderedWord = nextRange;
    }

    // HTMLAudioElement timeupdate fires only a few times per second. That can
    // skip short first words and leave a cue behind after the reciter moves on.
    // This lightweight frame loop reads audio.currentTime directly; DOM word
    // queries and verse geometry run only when the verse itself changes.
    function startWordTracking() {
        if (highlightFrame || engine.audio.paused ||
            engine.state.provider !== 'quran-foundation') return;
        const tick = () => {
            highlightFrame = 0;
            if (engine.audio.paused || engine.state.provider !== 'quran-foundation') {
                syncHighlight(engine.snapshot());
                return;
            }
            // Advance the continuous recording's verse state at the actual
            // boundary, rather than waiting for the next timeupdate event.
            engine.__syncContinuousChapter?.();
            syncHighlight(engine.snapshot());
            if (!highlightFrame) highlightFrame = requestAnimationFrame(tick);
        };
        highlightFrame = requestAnimationFrame(tick);
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
        requestAnimationFrame(() => syncHighlight(engine.snapshot()));
        startWordTracking();
    });
    engine.addEventListener('time', event => {
        applyState(event.detail, false);
        syncHighlight(event.detail);
        startWordTracking();
    });

    ui.open.addEventListener('click', openOptions);
    function openRepeat() {
        closeOptions();
        const maxAyah = core.VERSE_COUNTS[engine.state.surah - 1];
        ui.repeatStart.max = String(maxAyah);
        ui.repeatEnd.max = String(maxAyah);
        updatePicker('repeat');
        ui.repeatBackdrop.hidden = false;
        ui.repeatSheet.hidden = false;
        ui.repeatSheet.setAttribute('aria-hidden', 'false');
    }
    function closeRepeat() {
        closePickers();
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
            await engine.selectAligned(lastAlignedId, { surah: Number(ui.surah.value) || 1, ayah: 1 });
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
        if (value.startsWith('aligned:')) {
            const id = Number(value.slice('aligned:'.length));
            if (!alignedReciters.some(reciter => reciter.id === id)) return;
            const ready = await engine.selectAligned(id, {
                surah: Number(ui.surah.value) || 1, ayah: 1, autoplay: wasPlaying
            });
            if (ready) {
                lastAlignedId = id;
                window.dispatchEvent(new Event('mushaf:reciter-changed'));
            }
            else ui.status.textContent = engine.error || 'تعذّر تجهيز تلاوة القارئ المتزامنة لهذه السورة. جرّب قارئًا آخر.';
            return;
        }
        const reciter = catalog.find(item => item.id === Number(value.replace('mp3:', '')));
        if (!reciter) return;
        const moshaf = core.bestMoshaf(reciter);
        if (moshaf) {
            const ready = await engine.selectMp3(reciter, moshaf, { surah: Number(ui.surah.value) || 1, autoplay: wasPlaying });
            if (ready) window.dispatchEvent(new Event('mushaf:reciter-changed'));
        }
    });
    ui.moshaf.addEventListener('change', async () => {
        if (applyingState || !activeReciter) return;
        const moshaf = activeReciter.moshaf.find(item => item.id === Number(ui.moshaf.value));
        if (moshaf) await engine.selectMp3(activeReciter, moshaf, { surah: Number(ui.surah.value) || 1, autoplay: !engine.audio.paused });
    });
    ui.surah.addEventListener('change', () => engine.goTo(Number(ui.surah.value), 1, { autoplay: !engine.audio.paused }));
    ui.speed.addEventListener('change', () => engine.setSpeed(ui.speed.value));
    ui.autoFollow.addEventListener('change', () => engine.setAutoFollow(ui.autoFollow.checked));

    function readerIdentity(name) {
        return core.normalizeArabic(String(name || ''))
            .replace(/الشيخ|القارئ/g, '')
            .replace(/[^ء-ي0-9]/g, '');
    }

    function alignedForCurrentReader(state = engine.state) {
        if (state.provider === 'quran-foundation') {
            return alignedReciters.find(reciter => reciter.id === Number(state.reciterId)) || null;
        }
        const wanted = readerIdentity(state.reciterName);
        if (!wanted) return null;
        return alignedReciters.find(reciter => readerIdentity(reciter.name) === wanted) ||
            alignedReciters.find(reciter => {
                const candidate = readerIdentity(reciter.name);
                return candidate.length >= 8 && wanted.length >= 8 &&
                    (candidate.includes(wanted) || wanted.includes(candidate));
            }) || null;
    }

    async function switchLegacyMp3ToSameAlignedReader({ surah, ayah = 1, autoplay = false } = {}) {
        if (engine.state.provider !== 'mp3quran') return true;
        const reciter = alignedForCurrentReader(engine.state);
        if (!reciter) return false;
        const ready = await engine.selectAligned(reciter.id, {
            surah: Number(surah) || engine.state.surah,
            ayah: Number(ayah) || 1,
            autoplay
        });
        if (ready) lastAlignedId = reciter.id;
        return ready;
    }

    async function applyRepeat() {
        const mode = ui.repeatMode.value;
        const maxAyah = core.VERSE_COUNTS[engine.state.surah - 1];
        const start = Math.min(maxAyah, Math.max(1, Number(ui.repeatStart.value) || 1));
        const end = Math.min(maxAyah, Math.max(1, Number(ui.repeatEnd.value) || 1));
        const count = Math.min(99, Math.max(1, Number(ui.repeatCount.value) || 1));
        const wasPlaying = !engine.audio.paused || engine.intentToPlay;
        const switching = engine.state.provider === 'mp3quran' && (mode === 'verse' || mode === 'range');

        if (switching) {
            const sameReader = alignedForCurrentReader(engine.state);
            if (!sameReader) {
                ui.repeatHint.textContent = 'القارئ الحالي من مكتبة التلاوات لا يملك نسخة متزامنة داخل المصحف. اختر قارئًا متزامنًا من القائمة؛ لن نغيّر الشيخ تلقائيًا.';
                return;
            }
            ui.applyRepeatButton.disabled = true;
            ui.repeatHint.textContent = `جاري تجهيز النسخة المتزامنة للقارئ ${sameReader.name} لتكرار الآيات بدقة…`;
            const changed = await switchLegacyMp3ToSameAlignedReader({
                surah: engine.state.surah,
                ayah: mode === 'range' ? start : 1,
                autoplay: false
            });
            ui.applyRepeatButton.disabled = false;
            if (!changed) {
                ui.repeatHint.textContent = 'تعذّر تجهيز النسخة المتزامنة للقارئ نفسه. تحقق من الاتصال وحاول مرة أخرى.';
                return;
            }
        }

        engine.setRepeat({ mode, start, end, count, completed: 0 });
        repeatClasses(mode);
        if (mode === 'range') {
            const first = engine.state.repeat.start;
            const started = await engine.goTo(engine.state.surah, first, { autoplay: wasPlaying });
            if (!started) {
                ui.repeatHint.textContent = 'تعذّر بدء تكرار نطاق الآيات. حاول مرة أخرى.';
                return;
            }
        } else if (switching && wasPlaying) {
            await engine.play();
        }
        closeRepeat();
    }
    ui.repeatMode.addEventListener('change', () => {
        repeatClasses(ui.repeatMode.value);
        if (engine.state.provider === 'mp3quran' && ['verse', 'range'].includes(ui.repeatMode.value)) {
            const sameReader = alignedForCurrentReader(engine.state);
            ui.repeatHint.textContent = sameReader
                ? `سيتم استخدام النسخة المتزامنة لنفس القارئ ${sameReader.name} حتى يعمل التكرار بدقة.`
                : 'هذا التسجيل غير متزامن داخل المصحف. اختر قارئًا متزامنًا من القائمة؛ لن نغيّر الشيخ تلقائيًا.';
            return;
        }
        ui.repeatHint.textContent = 'تكرار الآية يعيد الآية الحالية، وتكرار النطاق يعيد الآيات من البداية للنهاية بعدد المرات المحدد.';
    });
    ui.applyRepeatButton.addEventListener('click', applyRepeat);

    function showSwitchNotice(title, message) {
        ui.switchNoticeTitle.textContent = title;
        ui.switchNoticeMessage.textContent = message;
        ui.switchNotice.hidden = false;
    }
    ui.switchNoticeDismiss.addEventListener('click', () => {
        ui.switchNotice.hidden = true;
    });

    ui.listenAction.addEventListener('click', async () => {
        const selected = window.mushafVerseActions?.getSelectedVerse?.();
        if (!selected) return;
        window.mushafVerseActions.close();
        listenNotice = '';
        listenNoticeUntil = 0;

        let started = false;
        if (engine.state.provider === 'quran-foundation') {
            started = await engine.goTo(selected.surah, selected.ayah, { autoplay: true });
        } else {
            const previousReader = engine.state.reciterName;
            showSwitchNotice('تنبيه: هذا القارئ لا يدعم التشغيل من آية محددة',
                `القارئ «${previousReader}» من مكتبة التلاوات غير المتزامنة، وتسجيله لا يوفر توقيتًا دقيقًا للآيات والكلمات. لذلك يتم التحويل تلقائيًا إلى مشاري راشد العفاسي لتشغيل الآية ${core.arabicDigits(selected.ayah)} من سورة ${core.SURAH_NAMES[selected.surah - 1]} مع التظليل. تغيير القارئ مقصود وليس خطأ في التطبيق. جاري التجهيز…`);
            // An explicit user request to listen to an individual verse is the
            // only action that switches a non-aligned MP3 reader to Mishary.
            // Never try to seek inside an unaligned full-surah MP3 recording.
            started = await engine.selectAligned(7, {
                surah: selected.surah,
                ayah: selected.ayah,
                autoplay: true
            });
            if (started) {
                lastAlignedId = 7;
                showSwitchNotice('تم التحويل إلى مشاري العفاسي لتشغيل الآية',
                    `القارئ «${previousReader}» لا يدعم البدء من آية محددة. تم اختيار مشاري راشد العفاسي تلقائيًا، وبدأ تشغيل الآية ${core.arabicDigits(selected.ayah)} من سورة ${core.SURAH_NAMES[selected.surah - 1]} مع التظليل. هذا سلوك مقصود في التطبيق وليس عطلًا. يمكنك الرجوع لقارئك السابق من «مكتبة التلاوات» في أي وقت.`);
            } else {
                showSwitchNotice('تعذّر تشغيل الآية بمشاري العفاسي',
                    `تسجيل «${previousReader}» لا يدعم البدء من آية محددة. حاول التطبيق التحويل إلى مشاري العفاسي، لكن تعذّر بدء الصوت. تحقق من الاتصال وحاول مجددًا. هذا ليس تغييرًا عشوائيًا للقارئ.`);
            }
        }

        if (!started) {
            listenNotice = 'تعذّر بدء الآية المحددة. تحقق من الاتصال وحاول مجددًا.';
            listenNoticeUntil = Date.now() + 8000;
            ui.status.textContent = listenNotice;
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

    function setDownloadBusy(busy) {
        downloadBatch = busy;
        ui.download.disabled = busy;
        ui.downloadAll.disabled = busy;
        ui.cancelDownload.hidden = !busy;
        ui.cancelDownload.disabled = false;
        if (busy) cancelRequested = false;
    }

    async function tracksForSurah(state, surah) {
        if (state.provider === 'quran-foundation') {
            if (typeof engine.getAlignedChapterAudio === 'function') {
                const chapter = await engine.getAlignedChapterAudio(surah);
                const track = currentTrack({ ...state, surah }, {
                    audioUrl: chapter.audioUrl,
                    ayah: null
                });
                return track ? [track] : [];
            }
            const chapter = await engine.timing.chapter(state.reciterId, surah);
            return [...chapter.values()].sort((a, b) => a.ayah - b.ayah)
                .map(timing => currentTrack({ ...state, surah }, timing)).filter(Boolean);
        }
        const track = currentTrack({ ...state, surah });
        return track ? [track] : [];
    }

    async function downloadRecitation(all = false) {
        if (downloadBatch) return;
        const state = engine.snapshot();
        const surahs = all ? [...state.availableSurahs] : [state.surah];
        if (all) {
            const count = `${surahs.length} ملف سورة`;
            const accepted = window.confirm(
                `تحميل المصحف الصوتي للقارئ ${state.reciterName}؟\\n` +
                `سيتم تنزيل ${count}، وقد يستهلك مساحة كبيرة جدًا وباقة الإنترنت.\\n` +
                'يُفضّل استخدام Wi-Fi. يمكن إيقاف التنزيل من نفس الصفحة. هل تريد البدء؟'
            );
            if (!accepted) return;
        }
        setDownloadBusy(true);
        let saved = 0, skipped = 0;
        try {
            for (let surahIndex = 0; surahIndex < surahs.length; surahIndex++) {
                if (cancelRequested) break;
                const surah = surahs[surahIndex];
                ui.downloadProgress.textContent = `تجهيز تلاوة سورة ${core.SURAH_NAMES[surah - 1]} (${surahIndex + 1}/${surahs.length})…`;
                const tracks = await tracksForSurah(state, surah);
                if (!tracks.length) throw new Error('لا يوجد تسجيل صوتي متاح لهذه السورة.');
                for (let index = 0; index < tracks.length; index++) {
                    if (cancelRequested) break;
                    const track = tracks[index];
                    ui.downloadProgress.textContent =
                        `سورة ${core.SURAH_NAMES[surah - 1]} (${surahIndex + 1}/${surahs.length}) • تسجيل ${index + 1}/${tracks.length} • تم حفظ ${saved}`;
                    if (await downloads.has(track.url)) { skipped++; continue; }
                    await downloads.downloadTrack(track);
                    saved++;
                }
            }
            ui.downloadProgress.textContent = cancelRequested
                ? `تم إيقاف تنزيل التلاوة. المحفوظ: ${saved}، الموجود مسبقًا: ${skipped}. يمكن استكمال الباقي لاحقًا.`
                : `اكتمل تنزيل التلاوة الصوتية. جديد: ${saved}، موجود مسبقًا: ${skipped}.`;
        } catch (error) {
            ui.downloadProgress.textContent = `${error?.message || 'تعذّر تنزيل التلاوة.'} • تم حفظ ${saved} ملف، ويمكن إعادة المحاولة لاستكمال الباقي.`;
        } finally {
            setDownloadBusy(false);
            renderDownloads();
        }
    }
    ui.download.addEventListener('click', () => downloadRecitation(false));
    ui.downloadAll.addEventListener('click', () => downloadRecitation(true));
    ui.cancelDownload.addEventListener('click', () => {
        cancelRequested = true;
        ui.cancelDownload.disabled = true;
        ui.downloadProgress.textContent = 'سيتم إيقاف التنزيل بعد انتهاء الملف الحالي…';
    });

    async function refreshStorage() {
        const tracks = downloads.list();
        const builtIn = tracks.filter(item => item.bundled);
        const added = tracks.filter(item => !item.bundled);
        const addedBytes = added.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
        const estimate = await downloads.estimate();
        const free = estimate ? Math.max(0, estimate.quota - estimate.usage) : null;
        ui.storageInfo.textContent = (builtIn.length ? `مضمنة مع التطبيق: ${core.arabicDigits(builtIn.length)} سورة • ` : '') +
            `التنزيلات الإضافية: ${downloadsApi.humanSize(addedBytes)}` +
            (free === null ? ' • المساحة المتاحة غير معروفة' :
                ` • مساحة تخزين متاحة تقريبًا: ${downloadsApi.humanSize(free)}`) +
            ' • يُفضّل استخدام Wi-Fi لتنزيل المصحف كاملًا.';
    }

    function renderDownloads() {
        const reciters = new Map();
        downloads.list().forEach(item => {
            const key = `${item.provider}:${item.reciterId}`;
            if (!reciters.has(key)) reciters.set(key, { name: item.reciterName || 'القارئ', surahs: new Map() });
            const reciter = reciters.get(key);
            const surahKey = Number(item.surah);
            if (!reciter.surahs.has(surahKey)) reciter.surahs.set(surahKey, []);
            reciter.surahs.get(surahKey).push(item);
        });
        const fragment = document.createDocumentFragment();
        reciters.forEach(reciter => {
            const folder = document.createElement('details');
            folder.className = 'audio-download-folder';
            const summary = document.createElement('summary');
            const title = document.createElement('strong');
            title.textContent = '📁 ' + reciter.name;
            const count = document.createElement('small');
            count.textContent = core.arabicDigits(reciter.surahs.size) + ' سورة محفوظة';
            summary.append(title, count);
            folder.appendChild(summary);
            const grid = document.createElement('div');
            grid.className = 'audio-download-folder-grid';
            [...reciter.surahs.entries()].sort((a, b) => a[0] - b[0]).forEach(([surah, items]) => {
                const chip = document.createElement('div');
                chip.className = 'audio-download-chip';
                const label = document.createElement('span');
                label.textContent = core.SURAH_NAMES[surah - 1] || items[0].surahName || 'سورة';
                label.title = 'سورة ' + label.textContent;
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.textContent = '×';
                remove.title = 'حذف تلاوة سورة ' + label.textContent;
                remove.setAttribute('aria-label', remove.title);
                const packaged = items.every(item => item.bundled);
                if (packaged) {
                    const badge = document.createElement('small');
                    badge.className = 'audio-bundled-mark';
                    badge.textContent = 'مضمنة';
                    chip.append(label, badge);
                } else {
                    remove.addEventListener('click', async () => {
                        if (!confirm('حذف التلاوة المحفوظة لسورة ' + label.textContent + '؟')) return;
                        remove.disabled = true;
                        try {
                            for (const item of items.filter(item => !item.bundled)) {
                                await downloads.remove(item.url);
                            }
                            renderDownloads();
                        } catch (error) {
                            remove.disabled = false;
                            console.error('Unable to remove saved recitation', error);
                        }
                    });
                    chip.append(label, remove);
                }

                grid.appendChild(chip);
            });
            folder.appendChild(grid);
            fragment.appendChild(folder);
        });
        ui.downloadList.replaceChildren(fragment);
        refreshStorage();
    }

    let progressStart = 0;
    // Both the recitations library and mushaf share the same cache and index.
    window.addEventListener('quran-downloads:change', () => {
        if (!downloadBatch) renderDownloads();
    });
    window.addEventListener('storage', event => {
        if (event.key === downloadsApi.INDEX_KEY && !downloadBatch) renderDownloads();
    });

    downloads.addEventListener('change', event => {
        const detail = event.detail;
        if (detail.status === 'starting') progressStart = Date.now();
        if (detail.status === 'paused') {
            ui.downloadProgress.textContent = navigator.onLine === false
                ? '⏸ الإنترنت مقطوع. التنزيل محفوظ وسيتابع تلقائيًا عند رجوع الاتصال.'
                : '⏸ تنزيل التلاوة متوقف مؤقتًا، في انتظار الشبكة. سيتم استكماله تلقائيًا.';
        }
        if (detail.status === 'downloading') {
            const seconds = Math.max(1, (Date.now() - progressStart) / 1000);
            const speed = detail.received / seconds;
            const remaining = detail.total && speed > 0 ? Math.ceil((detail.total - detail.received) / speed) : null;
            const eta = remaining === null ? 'جارٍ حساب الوقت المتبقي' :
                remaining >= 60 ? `متبقي حوالي ${Math.ceil(remaining / 60)} دقيقة` : `متبقي حوالي ${remaining} ثانية`;
            const percent = detail.total ? `${Math.round(detail.progress * 100)}٪` : downloadsApi.humanSize(detail.received);
            ui.downloadProgress.textContent = `⬇ ${percent} • ${eta} • ${downloadsApi.humanSize(speed)}/ث`;
            ui.downloadProgress.style.setProperty('--download-progress', detail.total ? `${Math.round(detail.progress * 100)}%` : '0%');
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        closePickers();
        if (ui.sheet.classList.contains('is-open')) closeOptions();
        closeRepeat();
    });
    window.addEventListener('pagehide', () => engine.destroy());


    // Discover additional reciters from the same provider as the synchronized
    // Mishary recording. Only display reciters whose sample chapter actually
    // contains usable verse AND word timestamps; names alone are not proof.
    function addAlignedReciter(item) {
        const id = Number(item?.id);
        const name = String(item?.name || '').trim();
        if (!Number.isSafeInteger(id) || !name || alignedReciters.some(reciter => reciter.id === id)) return false;
        if (!engine.registerAlignedReciter({ id, name })) return false;
        alignedReciters.push({ id, name, label: `${name} • تظليل الكلمات` });
        return true;
    }

    function hasWordTimings(payload) {
        const file = payload?.audio_file;
        if (Number(file?.chapter_id) !== 1 || !Array.isArray(file?.timestamps) ||
            file.timestamps.length !== core.VERSE_COUNTS[0]) return false;
        return file.timestamps.every(verse => {
            const segments = verse.segments;
            return /^1:[1-7]$/.test(String(verse.verse_key || '')) &&
                Array.isArray(segments) && segments.length > 0 &&
                segments.every(segment => Array.isArray(segment) && segment.length === 3 &&
                    Number.isInteger(Number(segment[0])) && Number(segment[0]) > 0 &&
                    Number.isFinite(Number(segment[1])) && Number.isFinite(Number(segment[2])) &&
                    Number(segment[2]) > Number(segment[1]));
        });
    }

    function updateAlignedDiscoveryStatus(message) {
        alignedDiscoveryStatus = message;
        if (engine.state.provider === 'quran-foundation') {
            ui.syncNote.textContent = message;
        }
    }

    async function loadAlignedReciters() {
        updateAlignedDiscoveryStatus('جاري البحث عن قراء بتوقيتات كلمات حقيقية…');
        try {
            const saved = JSON.parse(localStorage.getItem(ALIGNED_CACHE_KEY) || 'null');
            if (saved && Date.now() - saved.savedAt < 14 * 86400000 && Array.isArray(saved.reciters)) {
                saved.reciters.slice(0, MAX_ALIGNED - 1).forEach(addAlignedReciter);
                fillReciters(engine.snapshot());
            }
        } catch (_) { /* Private browsing or invalid cache. */ }

        try {
            const response = await fetch(`${core.QURAN_API}/resources/chapter_reciters?language=ar`,
                { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (!Array.isArray(payload?.reciters)) throw new Error('No chapter reciter catalog');
            const candidates = payload.reciters
                .map(item => ({ id: Number(item.id),
                    name: String(item.name || item.translated_name?.name || '').trim() }))
                .filter(item => Number.isSafeInteger(item.id) && item.id > 0 && item.name && item.id !== 7);
            let cursor = 0;
            let confirmed = 0;
            let tested = 0;
            async function verifyNext() {
                while (cursor < candidates.length && confirmed < MAX_ALIGNED - 1 &&
                    alignedReciters.length < MAX_ALIGNED) {
                    const item = candidates[cursor++];
                    if (alignedReciters.some(reciter => reciter.id === item.id)) {
                        confirmed++;
                        continue;
                    }
                    try {
                        const result = await fetch(
                            `${core.QURAN_API}/chapter_recitations/${item.id}/1?segments=true`,
                            { cache: 'force-cache' });
                        if (!result.ok || !hasWordTimings(await result.json())) continue;
                        if (addAlignedReciter(item)) {
                            confirmed++;
                            fillReciters(engine.snapshot());
                            updateAlignedDiscoveryStatus(
                                `تم التحقق من ${core.arabicDigits(alignedReciters.length)} قارئ بتظليل كلمات (اختبار الفاتحة). جارٍ فحص الباقي…`);
                        }
                    } catch (_) { /* A candidate without valid timing is not advertised. */ }
                    finally { tested++; }
                }
            }
            await Promise.all([verifyNext(), verifyNext(), verifyNext()]);
            alignedReciters.sort((a, b) => a.id === 7 ? -1 : b.id === 7 ? 1 :
                core.priorityIndex(a.name) - core.priorityIndex(b.name) ||
                a.name.localeCompare(b.name, 'ar'));
            try {
                localStorage.setItem(ALIGNED_CACHE_KEY, JSON.stringify({
                    savedAt: Date.now(), reciters: alignedReciters.filter(item => item.id !== 7)
                }));
            } catch (_) { /* Cache is optional. */ }
            fillReciters(engine.snapshot());
            updateAlignedDiscoveryStatus(
                `تم فحص ${core.arabicDigits(tested)} تسجيلًا؛ ${core.arabicDigits(alignedReciters.length)} قارئ بتوقيتات كلمات متاحة. يجب اختبار كل سورة قبل الاعتماد عليها.`);
        } catch (error) {
            updateAlignedDiscoveryStatus(
                `تعذّر جلب قائمة القراء المتزامنين (${error?.message || 'مشكلة اتصال'}). المتاح حاليًا: ${core.arabicDigits(alignedReciters.length)}. ` +
                'التلاوات الأخرى موجودة في صفحة التلاوات.');
        }
    }

    async function loadCatalog() {
        catalog = catalogService.cached();
        if (catalog.length) fillReciters(engine.state);
        try {
            catalog = await catalogService.load();
            fillReciters(engine.state);
        } catch (_) {
            if (!catalog.length) {
                // Aligned Mashary remains available even when the MP3 catalog is offline.
                ui.moshaf.disabled = true;
                fillReciters(engine.snapshot());
            }
        }
    }

    applyState(engine.snapshot(), true);
    loadCatalog();
    if (!window.QudAudioRegistry?.reciters?.length) {
        loadAlignedReciters();
    } else if (engine.state.provider === 'quran-foundation' &&
        window.QuranQud?.reciters?.some(reciter => Number(reciter.id) === Number(engine.state.reciterId))) {
        // Warm the selected QUD track immediately. This keeps the first press on
        // Play synchronous with HTMLAudioElement.play() instead of making the
        // user wait while timing metadata and the chapter source are discovered.
        engine.prepare({ autoplay: false }).catch(() => { /* The UI reports prepare errors. */ });
    }
})();
