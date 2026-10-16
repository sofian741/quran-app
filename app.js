(() => {
    'use strict';

    const DATA_URL = './data/quran-uthmani.txt';
    const LAYOUT_URL = './data/mushaf-layout.json';
    const STORAGE_KEY = 'quranReaderState';
    const SETTINGS_KEY = 'quranReaderSettings';
    const TOTAL_PAGES = 604;
    // Very short 320px phones need a small final step so the fixed player never covers a row.
    const MIN_FONT_SIZE = 14;
    // Start pages of the 30 juz in the standard 604-page Madinah mushaf.
    const JUZ_START_PAGES = [1,22,42,62,82,102,121,142,162,182,201,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582];
    const FIXED_FONT_SIZE = 34;
    const FIXED_LINE_HEIGHT = 1.42;
    // Page 1 keeps all source tokens in order while balancing only its line
    // breaks. Glyph size, shaping and word gaps remain identical to page 2.
    const FATIHAH_LINE_ENDS = [4, 9, 14, 19, 23, 27, 29];
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
        openIndex: $('open-index'),
        closeIndex: $('close-index'),
        indexSheet: $('index-sheet'),
        indexBackdrop: $('index-backdrop'),
        indexList: $('index-list'),
        indexTabs: Array.from(document.querySelectorAll('[data-index-tab]')),
        settings: $('settings-sheet'),
        backdrop: $('settings-backdrop'),
        openSettings: $('open-settings'),
        closeSettings: $('close-settings'),
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
    let suppressStageClick = false;
    let indexTab = 'surahs';
    let indexCloseTimer = null;
    let isTurningPage = false;
    let settingsPageSize = null;
    let settingsCloseTimer = null;

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
        renderIndex();

        if (document.fonts?.load) {
            await Promise.race([
                document.fonts.load('32px "Amiri Quran"'),
                wait(1800)
            ]);
        }

        renderCurrentPage();
        window.dispatchEvent(new Event('mushaf:data-ready'));
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
        const pageLayout = resolvePageLayout(displayPage);
        const fragment = document.createDocumentFragment();
        for (const line of pageLayout) {
            if (line[0] === 'h') fragment.appendChild(createSurahHeading(line[1]));
            else if (line[0] === 'b') fragment.appendChild(createBasmala(line[1], line[2]));
            else fragment.appendChild(createMushafLine(line[1], line[2]));
        }
        // Only the opening spread follows the compact, centered printed-mushaf layout.
        // Set the mode before fitting, including when moving back from later pages.
        els.text.classList.toggle('opening-spread', displayPage <= 2);
        els.text.dataset.openingPage = displayPage <= 2 ? String(displayPage) : '';
        delete els.text.dataset.standardLayoutPage;
        delete els.text.dataset.standardLayoutWidth;
        els.text.dataset.layoutState = 'pending';
        els.text.replaceChildren(fragment);
        els.text.style.setProperty('--mushaf-line-count', pageLayout.length);
        updatePageMeta(pageLayout);
        saveReaderState();
        window.dispatchEvent(new CustomEvent('mushaf:page-changed', {
            detail: { page: displayPage }
        }));
        // Complete sizing before paint, never show the temporary small text.
        fitPage();
        window.dispatchEvent(new CustomEvent('mushaf:page-ready', {
            detail: { page: displayPage }
        }));
    }

    function resolvePageLayout(pageNumber) {
        const sourceLayout = pages[pageNumber - 1];
        if (pageNumber !== 1) return sourceLayout;

        const textRows = sourceLayout.filter(row => row[0] === 'l');
        if (textRows[0]?.[1] !== 0 || textRows.at(-1)?.[2] !== 29) {
            throw new Error('Unexpected Al-Fatihah source range');
        }

        let start = 0;
        const balancedRows = FATIHAH_LINE_ENDS.map(end => {
            const row = ['l', start, end];
            start = end;
            return row;
        });
        return [...sourceLayout.filter(row => row[0] === 'h'), ...balancedRows];
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
        const leaf = (x, y, rotation, scale = 1) =>
            `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})">` +
                '<path class="botanical-leaf" d="M0 0C-5-10-19-13-13-25C-9-33-4-33 0-42C3-31 15-31 14-21C14-11 3-9 0 0Z"/>' +
                '<path class="botanical-vein" d="M0-3Q-4-18 0-33"/>' +
            '</g>';
        const flower = (x, y, radius = 1) => {
            const petals = Array.from({ length: 8 }, (_, index) =>
                `<path class="botanical-petal" transform="rotate(${index * 45})" d="M0-4C-8-10-14-17-8-24Q-3-27 0-35Q3-27 8-24C14-17 8-10 0-4Z"/>`
            ).join('');
            return `<g transform="translate(${x} ${y}) scale(${radius})">${petals}` +
                '<path class="botanical-calyx" d="M0-17Q4-5 17 0Q4 5 0 17Q-4 5-17 0Q-4-5 0-17Z"/>' +
                '<path class="botanical-heart" d="M0-7 6 0 0 7-6 0Z"/>' +
            '</g>';
        };
        const stems = `M35 112C65 109 70 66 111 68C144 68 159 83 148 108
            M35 112C65 115 70 158 111 156C144 156 159 141 148 116
            M79 89C64 88 54 72 61 65C68 57 79 65 75 73
            M79 135C64 136 54 152 61 159C68 167 79 159 75 151
            M139 108C149 77 176 62 204 76C239 94 218 117 200 107C189 101 195 89 202 92
            M139 116C149 147 176 162 204 148C239 130 218 107 200 117C189 123 195 135 202 132
            M207 79C223 70 232 63 242 68C255 77 242 87 236 80
            M207 145C223 154 232 161 242 156C255 147 242 137 236 144
            M222 112C246 103 262 86 267 69 M222 112C246 121 262 138 267 155`;
        const foliage = [
            [83,83,-48,.62],[103,70,-12,.56],[119,74,38,.5],
            [83,141,-132,.62],[103,154,192,.56],[119,150,142,.5],
            [166,78,28,.68],[187,71,66,.55],[214,86,108,.55],
            [166,146,152,.68],[187,153,114,.55],[214,138,72,.55],
            [247,96,-36,.63],[247,128,-144,.63],
            [54,104,-64,.54],[54,120,-116,.54]
        ].map(args => leaf(...args)).join('');
        const side = `<g class="botanical-side">` +
            '<path class="botanical-shadow" d="M41 112Q67 55 122 64Q176 48 212 69Q251 58 271 75Q254 99 227 112Q254 125 271 149Q251 166 212 155Q176 176 122 160Q67 169 41 112Z"/>' +
            `<path class="botanical-stem-outline" d="${stems}"/>` +
            `<path class="botanical-stem" d="${stems}"/>${foliage}` +
            `${flower(139,112)}${flower(92,65,.32)}${flower(92,159,.32)}` +
            `${flower(181,95,.28)}${flower(181,129,.28)}${flower(240,66,.27)}${flower(240,158,.27)}` +
            '<path class="botanical-gold-line" d="M50 112Q80 95 106 112Q80 129 50 112ZM217 112l11-7 11 7-11 7Z"/>' +
        '</g>';
        const cartouche = 'M342 54H658Q683 54 693 75Q711 71 720 88Q731 102 753 112Q731 122 720 136Q711 153 693 149Q683 170 658 170H342Q317 170 307 149Q289 153 280 136Q269 122 247 112Q269 102 280 88Q289 71 307 75Q317 54 342 54Z';
        const finial = '<path class="botanical-petal" d="M0 29C-6 17-15 15-16 5C-30 10-34-8-21-11C-21-26-9-28-6-38L0-50 6-38C9-28 21-26 21-11C34-8 30 10 16 5C15 15 6 17 0 29Z"/>' +
            '<path class="botanical-calyx" d="M0 17C-4 4-13 2-12-9Q-3-7 0 3Q3-7 12-9C13 2 4 4 0 17ZM0-10Q-13-23 0-38Q13-23 0-10Z"/>' +
            '<path class="botanical-vein" d="M0-35V11"/>';
        heading.innerHTML = `<svg class="surah-ornament" viewBox="0 0 1000 224" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
            '<path class="ornament-frame-outer" d="M28 40H972V184H28Z"/>' +
            '<path class="ornament-frame-inner" d="M34 46H966V178H34Z"/>' +
            '<path class="ornament-field" d="M41 53H959V171H41Z"/>' +
            `${side}<g transform="translate(1000 0) scale(-1 1)">${side}</g>` +
            `<path class="ornament-cartouche-rim" d="${cartouche}"/>` +
            `<path class="ornament-cartouche" d="${cartouche}"/>` +
            `<g class="ornament-watermark" transform="translate(309 112) scale(.8)">${flower(0,0)}${leaf(22,-7,50,.65)}${leaf(22,7,130,.65)}</g>` +
            `<g class="ornament-watermark" transform="translate(691 112) scale(-.8 .8)">${flower(0,0)}${leaf(22,-7,50,.65)}${leaf(22,7,130,.65)}</g>` +
            `<g transform="translate(500 53) scale(.65)">${finial}</g>` +
            `<g transform="translate(500 171) scale(.65 -.65)">${finial}</g>` +
            `<g transform="translate(34 112) rotate(-90) scale(.5)">${finial}</g>` +
            `<g transform="translate(966 112) rotate(90) scale(.5)">${finial}</g>` +
        '</svg>';
        const title = document.createElement('h2');
        title.className = 'surah-name';
        const titleLine = document.createElement('span');
        titleLine.className = 'surah-title-line';
        const prefix = document.createElement('span');
        prefix.className = 'surah-title-prefix';
        prefix.textContent = 'سورة';
        const chapter = document.createElement('span');
        chapter.className = 'surah-title-chapter';
        chapter.textContent = SURAH_NAMES[surah - 1];
        // Keep a real space for accessible text and existing textContent consumers.
        titleLine.append(prefix, document.createTextNode(' '), chapter);
        title.appendChild(titleLine);
        heading.appendChild(title);
        return heading;
    }

    function createAyahMarker(ayah) {
        const marker = document.createElement('span');
        marker.className = 'ayah-marker';
        marker.setAttribute('role', 'img');
        marker.setAttribute('aria-label', `الآية ${ayah}`);
        // Approved green-and-gold Quranic cartouche. One renderer for all pages.
        // Preserve the marker's existing dimensions so Quran line fitting is untouched.
        marker.dataset.digits = String(ayah).length;
        marker.innerHTML = `
            <svg class="ayah-ornament" viewBox="0 0 290 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                <path class="ayah-outer-edge" d="M145 12 C160 54 205 86 253 119 Q244 130 219 133 C240 166 245 228 220 267 Q242 266 253 281 C205 311 160 346 145 388 C130 346 85 311 37 281 Q48 266 70 267 C45 228 50 166 71 133 Q46 130 37 119 C85 86 130 54 145 12 Z"/>
                <path class="ayah-gold-rim" d="M145 20 C160 57 206 94 245 118 Q232 128 212 126 C236 161 240 230 211 275 Q232 272 245 282 C204 309 158 351 145 379 C132 351 86 309 45 282 Q58 272 79 275 C50 230 54 161 78 126 Q58 128 45 118 C84 94 130 57 145 20 Z"/>
                <path class="ayah-ivory-rim" d="M145 32 C162 65 195 92 232 116 Q216 119 203 115 C223 152 233 226 204 281 Q220 280 233 284 C191 314 159 344 145 364 C131 344 99 314 57 284 Q70 280 86 281 C57 226 67 152 87 115 Q74 119 58 116 C95 92 128 65 145 32 Z"/>
                <path class="ayah-side-inlay" d="M75 130 C57 168 57 229 75 267 L87 271 C64 222 67 168 92 131 Z M215 130 C233 168 233 229 215 267 L203 271 C226 222 223 168 198 131 Z"/>
                <path class="ayah-crown-inlay" d="M75 112 Q95 88 125 82 L120 101 Q98 104 89 116 Z M215 112 Q195 88 165 82 L170 101 Q192 104 201 116 Z"/>
                <path class="ayah-finial-leaf" d="M145 48 C162 67 163 83 145 100 C127 83 128 67 145 48 Z M145 352 C162 333 163 317 145 300 C127 317 128 333 145 352 Z"/>
                <path class="ayah-crown-inlay" d="M75 286 Q95 311 125 317 L120 297 Q98 295 89 283 Z M215 286 Q195 311 165 317 L170 297 Q192 295 201 283 Z"/>
                <path class="ayah-leaf-vein" d="M145 55 Q142 78 145 94 M145 345 Q142 322 145 306"/>
                <path class="ayah-inner-cartouche" d="M85 127 C103 107 126 108 145 126 C164 108 187 107 205 127 C230 160 230 240 205 273 C187 293 164 292 145 274 C126 292 103 293 85 273 C60 240 60 160 85 127 Z"/>
                <path class="ayah-inner-keyline" d="M88 130 C104 111 127 112 145 130 C163 112 186 111 202 130 C224 162 224 238 202 270 C186 289 163 288 145 270 C127 288 104 289 88 270 C66 238 66 162 88 130 Z"/>
            </svg>
            <span class="ayah-number">${toArabicDigits(ayah)}</span>
        `;
        return marker;
    }

    // Cache the exact measured typography for each page and viewport.
    // Swipe previews and the visible page share these measurements.
    const pageFitCache = new Map();
    const MAX_FIT_CACHE = 48;

    // Use Al-Baqarah's actual fitted font size as the opening-page reference.
    // Its longest lines can make the fitted size smaller than the shared 0.9
    // preference. Measuring a hidden copy once avoids guessing a scale.
    function getOpeningReferenceFont(container) {
        const key = [
            2, container.clientWidth, container.clientHeight,
            settings.fontSize, settings.lineHeight
        ].join(':');
        const cached = pageFitCache.get(key);
        if (cached) return cached.fontSize;

        const reference = document.createElement('article');
        reference.className = 'quran-text opening-spread';
        reference.dataset.openingPage = '2';
        reference.setAttribute('aria-hidden', 'true');
        Object.assign(reference.style, {
            position: 'absolute',
            left: '0',
            top: '0',
            width: `${container.getBoundingClientRect().width}px`,
            height: `${container.getBoundingClientRect().height}px`,
            visibility: 'hidden',
            pointerEvents: 'none'
        });
        const fragment = document.createDocumentFragment();
        for (const row of pages[1]) {
            if (row[0] === 'h') fragment.appendChild(createSurahHeading(row[1]));
            else if (row[0] === 'b') fragment.appendChild(createBasmala(row[1], row[2]));
            else fragment.appendChild(createMushafLine(row[1], row[2]));
        }
        reference.appendChild(fragment);
        container.parentElement.appendChild(reference);
        try {
            fitElement(reference, 2);
            return Number.parseFloat(reference.style.fontSize) || settings.fontSize * .9;
        } finally {
            reference.remove();
        }
    }

    function applyFitResult(container, lines, result) {
        const fontSize = `${result.fontSize.toFixed(2)}px`;
        container.style.fontSize = fontSize;
        container.style.setProperty('--mushaf-font-size', fontSize);
        container.style.setProperty('--mushaf-min-row-height',
            `${(result.fontSize * settings.lineHeight).toFixed(2)}px`);
        lines.forEach((line, index) => {
            line.classList.remove('is-measuring', 'is-full-line', 'is-short-line', 'is-crowded-line');
            line.classList.add(result.lineClasses[index]);
            line.style.transform = result.transforms[index];
        });
        lines.forEach(line => {
            line.style.fontSize = '';
            line.style.width = '';
            line.style.justifyContent = '';
            line.style.columnGap = '';
        });
        container.dataset.layoutState = 'ready';
    }

    function fitElement(container, pageNumber) {
        if (!tokens.length || !container.clientWidth || !container.clientHeight) return;
        const lines = Array.from(container.querySelectorAll('.mushaf-line'));
        container.classList.toggle('opening-spread', pageNumber <= 2);
        container.dataset.openingPage = pageNumber <= 2 ? String(pageNumber) : '';
        const key = [
            pageNumber, container.clientWidth, container.clientHeight,
            settings.fontSize, settings.lineHeight
        ].join(':');
        const cached = pageFitCache.get(key);
        if (cached && cached.lineClasses.length === lines.length) {
            applyFitResult(container, lines, cached);
            return;
        }

        container.dataset.layoutState = 'pending';
        // The opening spread uses the compact type scale of a printed mushaf.
        const preferred = pageNumber === 1
            ? Math.min(settings.fontSize * 0.9, getOpeningReferenceFont(container))
            : pageNumber === 2 ? settings.fontSize * 0.9 : settings.fontSize;
        container.style.fontSize = `${preferred}px`;
        container.style.setProperty('--mushaf-font-size', `${preferred}px`);
        container.style.setProperty('--mushaf-min-row-height', '0px');
        lines.forEach(line => {
            line.style.transform = '';
            line.style.fontSize = '';
            line.style.width = '';
            line.style.justifyContent = '';
            line.style.columnGap = '';
            line.classList.add('is-measuring');
            line.classList.remove('is-full-line', 'is-short-line', 'is-crowded-line');
        });

        const lineWidth = lines.reduce(
            (smallest, line) => Math.min(smallest, line.clientWidth),
            container.clientWidth
        );
        const availableWidth = Math.max(1, lineWidth - 12);
        const measureLineWidths = () => new Map(lines.map(line => {
            const children = Array.from(line.children);
            const gap = parseFloat(getComputedStyle(line).columnGap) || 0;
            return [line, children.reduce(
                (sum, child) => sum + child.getBoundingClientRect().width, 0
            ) + Math.max(0, children.length - 1) * gap];
        }));
        let lineWidths = measureLineWidths();
        const widest = Math.max(1, ...lineWidths.values());
        const widthLimit = preferred * availableWidth / widest;
        const textStyle = getComputedStyle(container);
        const verticalPadding = parseFloat(textStyle.paddingTop) +
            parseFloat(textStyle.paddingBottom);
        const structuralHeight = Array.from(container.children)
            .filter(element => !element.classList.contains('mushaf-line'))
            .reduce((height, element) => height + element.getBoundingClientRect().height, 0);
        const usableHeight = Math.max(
            1, container.clientHeight - verticalPadding - structuralHeight
        );
        const rowHeight = Math.max(1, usableHeight / Math.max(1, lines.length));
        const heightLimit = rowHeight / settings.lineHeight;
        let fitted = Math.max(
            MIN_FONT_SIZE, Math.min(preferred, widthLimit * 0.985, heightLimit * 0.985)
        );
        const applySize = () => {
            container.style.fontSize = `${fitted.toFixed(2)}px`;
            container.style.setProperty('--mushaf-font-size', `${fitted.toFixed(2)}px`);
            container.style.setProperty('--mushaf-min-row-height',
                `${(fitted * settings.lineHeight).toFixed(2)}px`);
        };
        applySize();
        lineWidths = measureLineWidths();
        const overflowRatio = Math.max(1, ...lineWidths.values()) / availableWidth;
        if (overflowRatio > 1.001 && fitted > MIN_FONT_SIZE) {
            fitted = Math.max(MIN_FONT_SIZE, fitted / overflowRatio * 0.985);
            applySize();
            lineWidths = measureLineWidths();
        }

        const lineClasses = [];
        for (const line of lines) {
            const children = Array.from(line.children);
            const ratio = lineWidths.get(line) / availableWidth;
            const lineClass = ratio > 1
                ? 'is-crowded-line'
                : children.length >= 4 && ratio >= 0.7
                    ? 'is-full-line'
                    : 'is-short-line';
            line.classList.remove('is-measuring', 'is-full-line', 'is-short-line', 'is-crowded-line');
            line.classList.add(lineClass);
            lineClasses.push(lineClass);
        }
        const transforms = lines.map(line => {
            const childBounds = Array.from(line.children)
                .map(child => child.getBoundingClientRect());
            const contentWidth = childBounds.length
                ? Math.max(...childBounds.map(rect => rect.right)) -
                    Math.min(...childBounds.map(rect => rect.left))
                : 0;
            const scale = Math.min(1, availableWidth / Math.max(1, contentWidth) * 0.985);
            return scale < 0.998 ? `scaleX(${scale.toFixed(4)})` : '';
        });
        const result = { fontSize: fitted, lineClasses, transforms };
        pageFitCache.set(key, result);
        if (pageFitCache.size > MAX_FIT_CACHE) {
            pageFitCache.delete(pageFitCache.keys().next().value);
        }
        applyFitResult(container, lines, result);
    }

    function fitPage() {
        if (isSettingsOpen()) return;
        fitElement(els.text, displayPage);
    }

    function adoptPreparedPage(preparedText, target, pageLayout) {
        if (!(preparedText instanceof HTMLElement) ||
            Number(preparedText.dataset.preparedPage) !== target ||
            preparedText.dataset.layoutState !== 'ready' ||
            preparedText.clientWidth !== els.text.clientWidth) return false;

        els.text.className = preparedText.className;
        els.text.style.cssText = preparedText.style.cssText;
        els.text.dataset.openingPage = preparedText.dataset.openingPage || '';
        els.text.dataset.layoutState = 'ready';
        if (preparedText.dataset.standardLayoutPage) {
            els.text.dataset.standardLayoutPage = preparedText.dataset.standardLayoutPage;
            els.text.dataset.standardLayoutWidth = preparedText.dataset.standardLayoutWidth;
        } else {
            delete els.text.dataset.standardLayoutPage;
            delete els.text.dataset.standardLayoutWidth;
        }
        els.text.replaceChildren(...preparedText.childNodes);
        els.text.scrollTop = 0;
        updatePageMeta(pageLayout);
        saveReaderState();
        window.dispatchEvent(new CustomEvent('mushaf:page-changed', {
            detail: { page: displayPage }
        }));
        window.dispatchEvent(new CustomEvent('mushaf:page-ready', {
            detail: { page: displayPage, prepared: true }
        }));
        return true;
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
        const juz = JUZ_START_PAGES.reduce((number, start, index) => displayPage >= start ? index + 1 : number, 1);
        els.pageRange.textContent = `الجزء ${toArabicDigits(juz)}`;
        els.toolbarSurah.textContent = title;
        els.toolbarRange.textContent = range;
        els.displayPageNumber.textContent = toArabicDigits(displayPage);

    }

    function turnPage(direction) {
        if (isTurningPage || isSettingsOpen() || isIndexOpen()) return;
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

    function renderIndex() {
        const entries = [];
        if (indexTab === 'surahs') {
            const starts = new Map();
            pages.forEach((page, i) => page.forEach(line => {
                if (line[0] === 'h') starts.set(line[1], i + 1);
            }));
            SURAH_NAMES.forEach((name, i) => entries.push({
                label: `سورة ${name}`,
                number: i + 1,
                page: starts.get(i + 1)
            }));
        } else {
            JUZ_START_PAGES.forEach((page, i) => entries.push({
                label: `الجزء ${toArabicDigits(i + 1)}`,
                number: i + 1,
                page
            }));
        }
        const fragment = document.createDocumentFragment();
        entries.forEach(entry => {
            if (!entry.page) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'index-entry';
            button.innerHTML = '<span class="index-entry-number"></span><span class="index-entry-name"></span><small class="index-entry-page"></small>';
            button.querySelector('.index-entry-number').textContent = toArabicDigits(entry.number);
            button.querySelector('.index-entry-name').textContent = entry.label;
            button.querySelector('.index-entry-page').textContent = `صفحة ${toArabicDigits(entry.page)}`;
            button.addEventListener('click', () => {
                closeIndex();
                displayPage = entry.page;
                els.text.scrollTop = 0;
                renderCurrentPage();
                els.body.classList.remove('tools-visible');
            });
            fragment.appendChild(button);
        });
        els.indexList.replaceChildren(fragment);
        els.indexTabs.forEach(button => {
            const active = button.dataset.indexTab === indexTab;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    function isIndexOpen() {
        return els.indexSheet.classList.contains('is-open');
    }

    function openIndex() {
        if (isIndexOpen() || isSettingsOpen()) return;
        clearTimeout(indexCloseTimer);
        renderIndex();
        els.body.classList.add('index-open');
        els.indexBackdrop.hidden = false;
        els.indexSheet.classList.add('is-open');
        els.indexSheet.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => els.indexBackdrop.classList.add('is-open'));
    }

    function closeIndex() {
        if (!isIndexOpen()) return;
        els.indexSheet.classList.remove('is-open');
        els.indexSheet.setAttribute('aria-hidden', 'true');
        els.indexBackdrop.classList.remove('is-open');
        indexCloseTimer = setTimeout(() => {
            els.indexBackdrop.hidden = true;
            els.body.classList.remove('index-open');
        }, 230);
    }

    function resetDrag(animate = true) {
        if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            els.page.style.transition = 'transform 180ms ease-out';
            els.page.style.transform = 'translateX(0)';
            setTimeout(() => { els.page.style.transition = ''; }, 190);
        } else {
            els.page.style.transform = '';
            els.page.style.transition = '';
        }
    }

    function bindEvents() {
        els.openIndex.addEventListener('click', event => {
            event.stopPropagation();
            openIndex();
        });
        els.closeIndex.addEventListener('click', closeIndex);
        els.indexBackdrop.addEventListener('click', closeIndex);
        els.indexTabs.forEach(button => button.addEventListener('click', () => {
            indexTab = button.dataset.indexTab;
            renderIndex();
            els.indexList.scrollTop = 0;
        }));
        els.openSettings.addEventListener('click', event => {
            event.stopPropagation();
            openSettings();
        });
        els.closeSettings.addEventListener('click', closeSettings);
        els.backdrop.addEventListener('click', closeSettings);
        els.stage.addEventListener('click', event => {
            if (suppressStageClick) {
                suppressStageClick = false;
                return;
            }
            if (event.target.closest('button, a, input') || isSettingsOpen() || isIndexOpen()) return;
            els.body.classList.toggle('tools-visible');
        });
    // Native pinch zoom must never trigger a one-finger page turn.
    const activeTouchPointers = new Set();
    // Small accidental magnification should not disable page turns.
    const PAGE_TURN_ZOOM_LIMIT = 1.15;
    const isPinchZoomed = () => (window.visualViewport?.scale || 1) >= PAGE_TURN_ZOOM_LIMIT;
    const syncZoomPanning = () => {
        els.body.classList.toggle('is-pinch-panning', isPinchZoomed());
        if (isPinchZoomed() && pointerStart) {
            pointerStart = null;
            resetDrag();
        }
    };
    window.visualViewport?.addEventListener('resize', syncZoomPanning, { passive: true });
    window.visualViewport?.addEventListener('scroll', syncZoomPanning, { passive: true });
    syncZoomPanning();
    els.stage.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch') return;
        activeTouchPointers.add(event.pointerId);
        if (activeTouchPointers.size > 1 || isPinchZoomed()) {
            pointerStart = null;
            resetDrag();
        }
    }, true);
    const releaseTouchPointer = event => {
        if (event.pointerType === 'touch') activeTouchPointers.delete(event.pointerId);
    };
    els.stage.addEventListener('pointerup', releaseTouchPointer, true);
    els.stage.addEventListener('pointercancel', releaseTouchPointer, true);
    window.addEventListener('blur', () => activeTouchPointers.clear());
        els.stage.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            if (isPinchZoomed() || activeTouchPointers.size > 1) return;
            if (isTurningPage || isSettingsOpen() || isIndexOpen()) return;
            pointerStart = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                scrollTop: els.text.scrollTop,
                dragging: false,
                dx: 0
            };
        });
        els.stage.addEventListener('pointermove', event => {
            if (!pointerStart || pointerStart.id !== event.pointerId || isSettingsOpen() || isIndexOpen() || isPinchZoomed() || activeTouchPointers.size > 1) return;
            const dx = event.clientX - pointerStart.x;
            const dy = event.clientY - pointerStart.y;
            if (!pointerStart.dragging) {
                if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
                    pointerStart = null;
                    return;
                }
                if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
                pointerStart.dragging = true;
                if (els.stage.setPointerCapture) els.stage.setPointerCapture(event.pointerId);
            }
            if (event.cancelable) event.preventDefault();
            const direction = dx > 0 ? 1 : -1;
            const canTurn = displayPage + direction >= 1 && displayPage + direction <= TOTAL_PAGES;
            pointerStart.dx = canTurn ? dx : dx * 0.18;
            els.page.style.transition = 'none';
            els.page.style.transform = `translateX(${pointerStart.dx}px)`;
            suppressStageClick = true;
        });
        els.stage.addEventListener('pointerup', event => {
            if (!pointerStart || pointerStart.id !== event.pointerId || isPinchZoomed() || activeTouchPointers.size > 1) return;
            const gesture = pointerStart;
            pointerStart = null;
            if (!gesture.dragging) return;
            const dx = gesture.dx;
            const direction = dx > 0 ? 1 : -1;
            const target = displayPage + direction;
            if (target < 1 || target > TOTAL_PAGES || Math.abs(dx) < Math.min(85, els.page.clientWidth * .2)) {
                resetDrag();
                return;
            }
            isTurningPage = true;
            const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
            const finish = () => {
                els.page.style.transition = '';
                els.page.style.transform = '';
                displayPage = target;
                els.text.scrollTop = 0;
                renderCurrentPage();
                isTurningPage = false;
            };
            if (reduced) {
                finish();
                return;
            }
            els.page.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
            els.page.style.transform = `translateX(${direction * els.page.clientWidth}px)`;
            els.page.style.opacity = '0.4';
            setTimeout(() => {
                els.page.style.transition = 'none';
                els.page.style.opacity = '0';
                finish();
                requestAnimationFrame(() => {
                    els.page.style.transition = 'opacity 150ms ease-out';
                    els.page.style.opacity = '1';
                    setTimeout(() => { els.page.style.transition = ''; }, 160);
                });
            }, 185);
        });
        const cancelDrag = () => {
            if (!pointerStart) return;
            const dragged = pointerStart.dragging;
            pointerStart = null;
            if (dragged) resetDrag();
        };
        els.stage.addEventListener('pointercancel', cancelDrag);
        window.addEventListener('blur', cancelDrag);
        window.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                closeSettings();
                closeIndex();
            }
            if (isIndexOpen()) return;
            if (event.key === 'ArrowLeft') turnPage(1);
            if (event.key === 'ArrowRight') turnPage(-1);
        });
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            if (!isSettingsOpen()) resizeTimer = setTimeout(fitPage, 100);
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
        els.reset.addEventListener('click', () => {
            settings = defaultSettings();
            applySettings(true);
        });
    }

    function defaultSettings() {
        return {
            fontSize: FIXED_FONT_SIZE,
            lineHeight: FIXED_LINE_HEIGHT,
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
                fontSize: FIXED_FONT_SIZE,
                lineHeight: FIXED_LINE_HEIGHT,
                theme: THEMES[saved.theme] ? saved.theme : 'paper',
                paperColor: THEMES[saved.theme]?.paper || defaults.paperColor,
                textColor: THEMES[saved.theme]?.text || defaults.textColor
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
        els.themeButtons.forEach(button => {
            button.classList.toggle('is-active', button.dataset.themeChoice === settings.theme);
        });
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        if (refit && tokens.length) requestAnimationFrame(fitPage);
    }

    function openSettings() {
        if (isSettingsOpen()) return;
        clearTimeout(settingsCloseTimer);
        clearTimeout(resizeTimer);
        const rect = els.page.getBoundingClientRect();
        settingsPageSize = { width: rect.width, height: rect.height };
        els.page.style.width = `${rect.width}px`;
        els.page.style.height = `${rect.height}px`;
        els.body.classList.add('settings-open');
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
        settingsCloseTimer = setTimeout(() => {
            els.backdrop.hidden = true;
            els.body.classList.remove('settings-open');
            els.page.style.width = '';
            els.page.style.height = '';
            const rect = els.page.getBoundingClientRect();
            const sizeChanged = settingsPageSize && (
                Math.abs(rect.width - settingsPageSize.width) > 1 ||
                Math.abs(rect.height - settingsPageSize.height) > 1
            );
            settingsPageSize = null;
            if (sizeChanged || els.text.dataset.layoutState !== 'ready') {
                requestAnimationFrame(fitPage);
            }
        }, 200);
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

    function toArabicDigits(value) {
        return String(value).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit]);
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    // Shared interface for the interactive swipe layer.
    window.mushafReader = {
        fitElement,
        getPageLayout(page) {
            if (!Number.isInteger(page) || page < 1 || page > TOTAL_PAGES) return null;
            return resolvePageLayout(page).map(row => [...row]);
        },
        getSurahName(surah) { return SURAH_NAMES[surah - 1] || ""; },
        getCurrentPage() { return displayPage; },
        getSearchVerses() { return verses; },
        goToPage(page) {
            if (isTurningPage || isSettingsOpen() || isIndexOpen() ||
                !Number.isInteger(page) || page < 1 || page > TOTAL_PAGES) return false;
            displayPage = page;
            els.text.scrollTop = 0;
            renderCurrentPage();
            els.body.classList.remove('tools-visible');
            return true;
        },
        getVerse(surah, ayah) {
            const verse = verses.find(item => item.surah === surah && item.ayah === ayah);
            return verse ? { ...verse } : null;
        },
        findVersePage(surah, ayah) {
            const index = tokens.findIndex(token => token.surah === surah && token.ayah === ayah);
            if (index < 0) return null;
            const pageIndex = pages.findIndex(page => page.some(line => line[0] !== 'h' && index >= line[1] && index < line[2]));
            return pageIndex < 0 ? null : pageIndex + 1;
        },
        goToVerse(surah, ayah, requestedPage) {
            if (isTurningPage || isSettingsOpen() || isIndexOpen()) return false;
            const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= TOTAL_PAGES
                ? requestedPage : this.findVersePage(surah, ayah);
            if (!page) return false;
            displayPage = page;
            els.text.scrollTop = 0;
            renderCurrentPage();
            els.body.classList.remove('tools-visible');
            return true;
        },
        turnPageInstant(direction, preparedText) {
            if (isTurningPage || isSettingsOpen() || isIndexOpen()) return false;
            const target = displayPage + direction;
            if (target < 1 || target > TOTAL_PAGES) return false;
            displayPage = target;
            const pageLayout = resolvePageLayout(displayPage);
            if (adoptPreparedPage(preparedText, target, pageLayout)) return true;
            els.text.scrollTop = 0;
            renderCurrentPage();
            return true;
        }
    };

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
})();
