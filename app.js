(() => {
    'use strict';

    const DATA_URL = './data/quran-uthmani.txt';
    const LAYOUT_URL = './data/mushaf-layout.json';
    const STORAGE_KEY = 'quranReaderState';
    const SETTINGS_KEY = 'quranReaderSettings';
    const TOTAL_PAGES = 604;
    const MIN_FONT_SIZE = 18;
    const SUFFIX_MARKS = new Set(['ۖ', 'ۚ', 'ۘ', 'ۗ', 'ۛ', 'ۙ', 'ۜ', '۩']);
    const PREFIX_MARKS = new Set(['۞']);

    const SURAH_NAMES = [
        'الفاتحة','البقرة','آل عمران','النساء','المائدة',
        'الأنعام','الأعراف','الأنفال','التوبة','يونس',
        'هود','يوسف','الرعد','إبراهيم','الحجر',
        'النحل','الإسراء','الكهف','مريم','طه',
        'الأنبياء','الحج','المؤمنون','النور','الفرقان',
        'الشعراء','النمل','القصص','العنكبوت','الروم',
        'لقمان','السجدة','الأحزاب','سبأ','فاطر',
        'يس','الصافات','ص','الزمر','غافر',
        'فصلت','الشورى','الزخرف','الدخان','الجاثية',
        'الأحقاف','محمد','الفتح','الحجرات','ق',
        'الذاريات','الطور','النجم','القمر','الرحمن',
        'الواقعة','الحديد','المجادلة','الحشر','الممتحنة',
        'الصف','الجمعة','المنافقون','التغابن','الطلاق',
        'التحريم','الملك','القلم','الحاقة','المعارج',
        'نوح','الجن','المزمل','المدثر','القيامة',
        'الإنسان','المرسلات','النبأ','النازعات','عبس',
        'التكوير','الانفطار','المطففين','الانشقاق',
        'البروج','الطارق','الأعلى','الغاشية','الفجر',
        'البلد','الشمس','الليل','الضحى','الشرح',
        'التين','العلق','القدر','البينة','الزلزلة',
        'العاديات','القارعة','التكاثر','العصر','الهمزة',
        'الفيل','قريش','الماعون','الكوثر','الكافرون',
        'النصر','المسد','الإخلاص','الفلق','الناس'
    ];

    const THEMES = {
        paper: { paper: '#fbf6e8', text: '#18221f', accent: '#176b63' },
        white: { paper: '#fffefa', text: '#17201d', accent: '#176b63' },
        mint: { paper: '#edf7f0', text: '#17302a', accent: '#176b63' },
        dark: { paper: '#18201d', text: '#f3ead5', accent: '#76c8b9' }
    };

    const $ = id => document.getElementById(id);
    const els = {
        body: document.body,
        loading: $('loading-screen'),
        stage: $('reader-stage'),
        page: $('mushaf-page'),
        text: $('quran-text'),
        pageSurah: $('page-surah'),
        pageRange: $('page-range'),
        toolbarSurah: $('toolbar-surah'),
        toolbarRange: $('toolbar-range'),
        displayPageNumber: $('display-page-number'),
        navPageNumber: $('nav-page-number'),
        prev: $('prev-page'),
        next: $('next-page'),
        settings: $('settings-sheet'),
        backdrop: $('settings-backdrop'),
        openSettings: $('open-settings'),
        closeSettings: $('close-settings'),
        fontRange: $('font-size-range'),
        fontValue: $('font-size-value'),
        lineRange: $('line-height-range'),
        lineValue: $('line-height-value'),
        paperColor: $('paper-color'),
        textColor: $('text-color'),
        reset: $('reset-settings'),
        themeButtons: Array.from(document.querySelectorAll('[data-theme-choice]'))
    };

    let verses = [];
    let tokens = [];
    let pages = [];
    let displayPage = 1;
    let settings = loadSettings();
    let resizeTimer = null;
    let pointerStart = null;
    let isTurningPage = false;
    let fitRevision = 0;

    init().catch(error => {
        console.error(error);
        if (els.loading) {
            els.loading.innerHTML =
                '<strong>تعذر تحميل المصحف.</strong>' +
                '<small>تأكد من تشغيل المشروع من خادم محلي.</small>';
        }
    });

    async function init() {
        applySettings(false);
        bindEvents();

        const [quranResponse, layoutResponse] = await Promise.all([
            fetch(DATA_URL),
            fetch(LAYOUT_URL)
        ]);
        if (!quranResponse.ok || !layoutResponse.ok) {
            throw new Error('Failed to load local mushaf data');
        }

        verses = parseQuran(await quranResponse.text());
        tokens = buildTokens(verses);
        pages = validateLayout(await layoutResponse.json(), tokens.length);
        displayPage = loadReaderState();

        if (document.fonts?.load) {
            await Promise.race([
                document.fonts.load('32px "Amiri Quran"'),
                wait(1800)
            ]);
        }

        renderCurrentPage();
        els.loading.classList.add('is-hidden');
        setTimeout(() => els.loading?.remove(), 260);
    }

    function parseQuran(raw) {
        const parsed = [];
        for (const line of raw.split(/\r?\n/)) {
            if (!line || line.startsWith('#')) continue;
            const first = line.indexOf('|');
            const second = line.indexOf('|', first + 1);
            if (first < 1 || second < 0) continue;

            const surah = Number(line.slice(0, first));
            const ayah = Number(line.slice(first + 1, second));
            const text = line.slice(second + 1).trim();
            if (Number.isInteger(surah) && Number.isInteger(ayah) && text) {
                parsed.push({ surah, ayah, text });
            }
        }
        if (parsed.length !== 6236) {
            throw new Error(`Unexpected Quran verse count: ${parsed.length}`);
        }
        return parsed;
    }

    function splitQuranWords(text) {
        const words = [];
        let prefix = '';
        for (const rawWord of text.split(/\s+/).filter(Boolean)) {
            if (PREFIX_MARKS.has(rawWord)) {
                prefix += rawWord;
            } else if (SUFFIX_MARKS.has(rawWord) && words.length) {
                words[words.length - 1] += `\u202f${rawWord}`;
            } else {
                words.push(prefix ? `${prefix}\u202f${rawWord}` : rawWord);
                prefix = '';
            }
        }
        return words;
    }

    function buildTokens(items) {
        const result = [];
        for (const verse of items) {
            const words = splitQuranWords(verse.text);
            words.forEach((text, word) => {
                result.push({
                    text,
                    surah: verse.surah,
                    ayah: verse.ayah,
                    word,
                    isAyahEnd: word === words.length - 1
                });
            });
        }
        return result;
    }

    function validateLayout(layout, wordCount) {
        if (layout?.version !== 1 || !Array.isArray(layout.pages) || layout.pages.length !== TOTAL_PAGES) {
            throw new Error('Invalid mushaf layout metadata');
        }
        let cursor = 0;
        let headers = 0;
        layout.pages.forEach((page, pageIndex) => {
            if (!Array.isArray(page) || !page.length) {
                throw new Error(`Empty mushaf page: ${pageIndex + 1}`);
            }
            page.forEach(line => {
                if (line[0] === 'h') {
                    if (line[1] !== ++headers) {
                        throw new Error(`Invalid surah order on page ${pageIndex + 1}`);
                    }
                    return;
                }
                if (!['l', 'b'].includes(line[0]) || line[1] !== cursor || !Number.isInteger(line[2]) || line[2] <= line[1]) {
                    throw new Error(`Broken word range on page ${pageIndex + 1}`);
                }
                cursor = line[2];
            });
        });
        if (cursor !== wordCount || headers !== 114) {
            throw new Error(`Incomplete mushaf layout: ${cursor}/${wordCount}, ${headers}/114`);
        }
        return layout.pages;
    }

    function renderCurrentPage() {
        const pageLayout = pages[displayPage - 1];
        const fragment = document.createDocumentFragment();
        for (const line of pageLayout) {
            if (line[0] === 'h') fragment.appendChild(createSurahHeading(line[1]));
            else if (line[0] === 'b') fragment.appendChild(createBasmala(line[1], line[2]));
            else fragment.appendChild(createMushafLine(line[1], line[2]));
        }
        els.text.replaceChildren(fragment);
        els.text.style.setProperty('--mushaf-line-count', pageLayout.length);
        updatePageMeta(pageLayout);
        saveReaderState();
        requestAnimationFrame(() => requestAnimationFrame(fitPage));
    }

    function createMushafLine(start, end) {
        const line = document.createElement('div');
        line.className = 'mushaf-line is-measuring';
        line.dataset.start = String(start);
        line.dataset.end = String(end);
        for (let index = start; index < end; index++) {
            const token = tokens[index];
            const word = createWord(token);
            if (token.isAyahEnd) {
                const group = document.createElement('span');
                group.className = 'ayah-end-group';
                group.append(word, createAyahMarker(token.ayah));
                line.appendChild(group);
            } else {
                line.appendChild(word);
            }
        }
        return line;
    }

    function createWord(token) {
        const word = document.createElement('span');
        word.className = 'mushaf-word';
        word.dataset.verse = `${token.surah}:${token.ayah}`;
        word.dataset.word = String(token.word);
        word.textContent = token.text;
        return word;
    }

    function createBasmala(start, end) {
        const basmala = document.createElement('div');
        basmala.className = 'surah-basmala';
        for (let index = start; index < end; index++) {
            basmala.appendChild(createWord(tokens[index]));
        }
        return basmala;
    }

    function createSurahHeading(surah) {
        const heading = document.createElement('header');
        heading.className = 'surah-heading';
        heading.dataset.surah = String(surah);
        const right = document.createElement('span');
        right.className = 'surah-wing';
        right.setAttribute('aria-hidden', 'true');
        const title = document.createElement('h2');
        title.className = 'surah-name';
        title.textContent = `سُورَةُ ${SURAH_NAMES[surah - 1]}`;
        const left = right.cloneNode();
        heading.append(right, title, left);
        return heading;
    }

    function createAyahMarker(ayah) {
        const marker = document.createElement('span');
        marker.className = 'ayah-marker';
        marker.setAttribute('role', 'img');
        marker.setAttribute('aria-label', `الآية ${ayah}`);
        marker.innerHTML =
            '<svg viewBox="0 0 44 44" aria-hidden="true" focusable="false">' +
                '<path class="ayah-star" d="M22 1.8 27.2 7l7.2-.3.3 7.2 5.2 5.1-5.2 5.1-.3 7.2-7.2-.3-5.2 5.2-5.2-5.2-7.2.3-.3-7.2L4.1 19l5.2-5.1.3-7.2 7.2.3Z"/>' +
                '<circle class="ayah-ring" cx="22" cy="19" r="11.3"/>' +
            '</svg>' +
            `<span class="ayah-number">${toArabicDigits(ayah)}</span>`;
        return marker;
    }

    function fitPage() {
        if (!tokens.length || !els.text.clientWidth) return;
        const revision = ++fitRevision;
        const lines = Array.from(els.text.querySelectorAll('.mushaf-line'));
        const lineCount = Number(els.text.style.getPropertyValue('--mushaf-line-count')) || 15;
        const preferred = settings.fontSize;
        els.text.style.setProperty('--mushaf-font-size', `${preferred}px`);
        lines.forEach(line => {
            line.style.transform = '';
            line.classList.add('is-measuring');
            line.classList.remove('is-full-line', 'is-short-line', 'is-crowded-line');
        });

        const availableWidth = Math.max(1, els.text.clientWidth - 12);
        let widest = 1;
        for (const line of lines) {
            const children = Array.from(line.children);
            const naturalWidth = children.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) +
                Math.max(0, children.length - 1) * preferred * 0.16;
            widest = Math.max(widest, naturalWidth);
        }

        const widthLimit = preferred * availableWidth / widest;
        const rowHeight = Math.max(1, els.text.clientHeight / lineCount);
        const heightLimit = rowHeight / settings.lineHeight;
        let fitted = Math.max(MIN_FONT_SIZE, Math.min(preferred, widthLimit * 0.985, heightLimit));

        const applyFittedSize = () => {
            els.text.style.setProperty('--mushaf-font-size', `${fitted.toFixed(2)}px`);
            els.text.style.setProperty('--mushaf-min-row-height', `${(fitted * settings.lineHeight).toFixed(2)}px`);
        };

        const classifyLines = () => {
            for (const line of lines) {
                const children = Array.from(line.children);
                const naturalWidth = children.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) +
                    Math.max(0, children.length - 1) * fitted * 0.16;
                const ratio = naturalWidth / availableWidth;
                const crowded = ratio > 1;
                const full = children.length >= 4 && ratio >= 0.7;
                line.classList.remove('is-measuring');
                line.classList.add(
                    crowded
                        ? 'is-crowded-line'
                        : full ? 'is-full-line' : 'is-short-line'
                );
            }

            requestAnimationFrame(() => {
                if (revision !== fitRevision) return;
                for (const line of lines) {
                    const childBounds = Array.from(line.children)
                        .map(child => child.getBoundingClientRect());
                    const contentWidth = childBounds.length
                        ? Math.max(...childBounds.map(rect => rect.right)) -
                            Math.min(...childBounds.map(rect => rect.left))
                        : 0;
                    const scale = Math.min(
                        1,
                        line.clientWidth / Math.max(1, contentWidth) * 0.965
                    );
                    line.style.transform = scale < 0.998
                        ? `scaleX(${scale.toFixed(4)})`
                        : '';
                }
            });
        };

        applyFittedSize();
        requestAnimationFrame(() => {
            if (revision !== fitRevision) return;
            const overflowRatio = lines.reduce(
                (largest, line) => Math.max(
                    largest,
                    line.scrollWidth / Math.max(1, line.clientWidth)
                ),
                1
            );

            if (overflowRatio > 1.002) {
                fitted = Math.max(MIN_FONT_SIZE, fitted / overflowRatio * 0.985);
                applyFittedSize();
                requestAnimationFrame(classifyLines);
            } else {
                classifyLines();
            }
        });
    }

    function updatePageMeta(pageLayout) {
        const ranges = pageLayout.filter(line => line[0] !== 'h');
        const first = tokens[ranges[0][1]];
        const last = tokens[ranges.at(-1)[2] - 1];
        const sameSurah = first.surah === last.surah;
        const title = sameSurah
            ? `سورة ${SURAH_NAMES[first.surah - 1]}`
            : `${SURAH_NAMES[first.surah - 1]} — ${SURAH_NAMES[last.surah - 1]}`;
        const range = sameSurah
            ? `الآيات ${toArabicDigits(first.ayah)}–${toArabicDigits(last.ayah)}`
            : `${toArabicDigits(first.surah)}:${toArabicDigits(first.ayah)} — ${toArabicDigits(last.surah)}:${toArabicDigits(last.ayah)}`;
        els.pageSurah.textContent = title;
        els.pageRange.textContent = range;
        els.toolbarSurah.textContent = title;
        els.toolbarRange.textContent = range;
        els.displayPageNumber.textContent = toArabicDigits(displayPage);
        els.navPageNumber.textContent = toArabicDigits(displayPage);
        els.prev.disabled = displayPage === 1;
        els.next.disabled = displayPage === TOTAL_PAGES;
    }

    function turnPage(direction) {
        if (isTurningPage || isSettingsOpen()) return;
        const target = displayPage + direction;
        if (target < 1 || target > TOTAL_PAGES) return;
        isTurningPage = true;
        const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion || !els.page.animate) {
            displayPage = target;
            els.text.scrollTop = 0;
            renderCurrentPage();
            isTurningPage = false;
            return;
        }
        const exit = direction > 0 ? 42 : -42;
        const animation = els.page.animate([
            { transform: 'translateX(0)', opacity: 1 },
            { transform: `translateX(${exit}px)`, opacity: 0 }
        ], { duration: 125, easing: 'ease-in', fill: 'forwards' });
        animation.finished.then(() => {
            displayPage = target;
            els.text.scrollTop = 0;
            renderCurrentPage();
            animation.cancel();
            return els.page.animate([
                { transform: `translateX(${-exit}px)`, opacity: 0 },
                { transform: 'translateX(0)', opacity: 1 }
            ], { duration: 150, easing: 'ease-out' }).finished;
        }).catch(() => {}).finally(() => { isTurningPage = false; });
    }

    function bindEvents() {
        els.next.addEventListener('click', () => turnPage(1));
        els.prev.addEventListener('click', () => turnPage(-1));
        els.openSettings.addEventListener('click', event => {
            event.stopPropagation();
            openSettings();
        });
        els.closeSettings.addEventListener('click', closeSettings);
        els.backdrop.addEventListener('click', closeSettings);
        els.stage.addEventListener('click', event => {
            if (event.target.closest('button, a, input') || isSettingsOpen()) return;
            els.body.classList.toggle('tools-visible');
        });
        els.stage.addEventListener('pointerdown', event => {
            pointerStart = { x: event.clientX, y: event.clientY, scrollTop: els.text.scrollTop };
        });
        els.stage.addEventListener('pointerup', event => {
            if (!pointerStart || isSettingsOpen()) return;
            const dx = event.clientX - pointerStart.x;
            const dy = event.clientY - pointerStart.y;
            const scrolled = Math.abs(els.text.scrollTop - pointerStart.scrollTop) > 4;
            pointerStart = null;
            if (!scrolled && Math.abs(dx) > 58 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                turnPage(dx > 0 ? 1 : -1);
            }
        });
        window.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft') turnPage(1);
            if (event.key === 'ArrowRight') turnPage(-1);
            if (event.key === 'Escape') closeSettings();
        });
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(fitPage, 100);
        });
        els.fontRange.addEventListener('input', () => {
            settings.fontSize = Number(els.fontRange.value);
            applySettings(true);
        });
        els.lineRange.addEventListener('input', () => {
            settings.lineHeight = Number(els.lineRange.value);
            applySettings(true);
        });
        els.themeButtons.forEach(button => {
            button.addEventListener('click', () => {
                settings.theme = button.dataset.themeChoice;
                const preset = THEMES[settings.theme];
                settings.paperColor = preset.paper;
                settings.textColor = preset.text;
                applySettings(false);
            });
        });
        els.paperColor.addEventListener('input', () => {
            settings.theme = 'custom';
            settings.paperColor = els.paperColor.value;
            applySettings(false);
        });
        els.textColor.addEventListener('input', () => {
            settings.theme = 'custom';
            settings.textColor = els.textColor.value;
            applySettings(false);
        });
        els.reset.addEventListener('click', () => {
            settings = defaultSettings();
            applySettings(true);
        });
    }

    function defaultSettings() {
        return {
            fontSize: 34,
            lineHeight: 1.42,
            theme: 'paper',
            paperColor: THEMES.paper.paper,
            textColor: THEMES.paper.text
        };
    }

    function loadSettings() {
        const defaults = defaultSettings();
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
            if (!saved) return defaults;
            return {
                fontSize: clamp(Number(saved.fontSize) || defaults.fontSize, 22, 42),
                lineHeight: clamp(Number(saved.lineHeight) || defaults.lineHeight, 1.25, 1.7),
                theme: THEMES[saved.theme] ? saved.theme : 'custom',
                paperColor: validHex(saved.paperColor) ? saved.paperColor : defaults.paperColor,
                textColor: validHex(saved.textColor) ? saved.textColor : defaults.textColor
            };
        } catch (_) {
            return defaults;
        }
    }

    function applySettings(refit) {
        const preset = THEMES[settings.theme];
        els.body.dataset.theme = settings.theme;
        els.body.style.setProperty('--page-paper', settings.paperColor);
        els.body.style.setProperty('--page-text', settings.textColor);
        els.body.style.setProperty('--reader-accent', preset?.accent || THEMES.paper.accent);
        els.body.style.setProperty('--reader-line-height', settings.lineHeight);
        els.fontRange.value = String(settings.fontSize);
        els.fontValue.value = String(settings.fontSize);
        els.lineRange.value = String(settings.lineHeight);
        els.lineValue.value = settings.lineHeight.toFixed(2);
        els.paperColor.value = settings.paperColor;
        els.textColor.value = settings.textColor;
        els.themeButtons.forEach(button => {
            button.classList.toggle('is-active', button.dataset.themeChoice === settings.theme);
        });
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        if (refit && tokens.length) requestAnimationFrame(fitPage);
    }

    function openSettings() {
        els.settings.classList.add('is-open');
        els.settings.setAttribute('aria-hidden', 'false');
        els.backdrop.hidden = false;
        requestAnimationFrame(() => els.backdrop.classList.add('is-open'));
    }

    function closeSettings() {
        if (!isSettingsOpen()) return;
        els.settings.classList.remove('is-open');
        els.settings.setAttribute('aria-hidden', 'true');
        els.backdrop.classList.remove('is-open');
        setTimeout(() => { els.backdrop.hidden = true; }, 200);
    }

    function isSettingsOpen() {
        return els.settings.classList.contains('is-open');
    }

    function saveReaderState() {
        const pageLayout = pages[displayPage - 1];
        const firstRange = pageLayout?.find(line => line[0] !== 'h');
        const first = firstRange ? tokens[firstRange[1]] : null;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            displayPage,
            surah: first?.surah,
            ayah: first?.ayah
        }));
    }

    function loadReaderState() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            return clamp(Number(saved?.displayPage) || 1, 1, TOTAL_PAGES);
        } catch (_) {
            return 1;
        }
    }

    function validHex(value) {
        return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    }

    function toArabicDigits(value) {
        return String(value).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit]);
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
})();
