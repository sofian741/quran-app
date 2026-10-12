
(() => {
    'use strict';

    const DATA_URL = './data/quran-uthmani.txt';
    const STORAGE_KEY = 'quranReaderState';
    const SETTINGS_KEY = 'quranReaderSettings';
    const TOTAL_PAGES = 604;

    // بدايات صفحات مصحف المدينة، بترقيم الآيات من الصفر.
    // Source: ouryhamdalaye/madinah-mushaf-json
    // pages/verse-to-page.json (CC BY-SA 4.0).
    // تُحمّل من ملف JSON المحلي دون تغيير حدود الصفحات.
    const PAGE_STARTS = [];

    async function loadPageStarts() {
        const response = await fetch('./data/verse-to-page.json');

        if (!response.ok) {
            throw new Error('تعذر تحميل بيانات صفحات المصحف');
        }

        const pages = await response.json();

        if (!Array.isArray(pages) || pages.length !== 604) {
            throw new Error('بيانات صفحات المصحف غير مكتملة');
        }

        for (const page of pages) {
            const index = verses.findIndex(
                verse =>
                    verse.surah === page.surah &&
                    verse.ayah === page.ayah
            );

            if (index === -1) {
                throw new Error(
                    `لم يتم العثور على الآية ${page.surah}:${page.ayah}`
                );
            }

            PAGE_STARTS.push(index);
        }
    }

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
        paper: {
            paper: '#fbf7ec',
            text: '#191b18',
            accent: '#176B63'
        },
        white: {
            paper: '#ffffff',
            text: '#181a18',
            accent: '#176B63'
        },
        mint: {
            paper: '#eef8f1',
            text: '#18302b',
            accent: '#176B63'
        },
        dark: {
            paper: '#171b1a',
            text: '#f1ead9',
            accent: '#5bc2b5'
        }
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
        themeButtons: Array.from(
            document.querySelectorAll('[data-theme-choice]')
        )
    };

    let verses = [];
    let tokens = [];
    let verseTokenStarts = [];

    let startIndex = 0;
    let endIndex = 0;
    let displayPage = 1;

    let resizeTimer = null;
    let pointerStart = null;
    let settings = loadSettings();

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

        const response = await fetch(DATA_URL);

        if (!response.ok) {
            throw new Error(
                'Quran data request failed: ' + response.status
            );
        }

        const raw = await response.text();

        verses = parseQuran(raw);
        await loadPageStarts();
        tokens = buildTokens(verses);

        const testLayout = await loadMushafLayout(2);
        window.testMushafLayout = testLayout;
        console.log('Mushaf layout loaded:', {
            page: testLayout.page,
            lines: testLayout.lines.length,
            firstLine: testLayout.lines[0],
            lastLine: testLayout.lines.at(-1)
        
    
        });
        
        const validation = validateMushafLayout(testLayout);
        const normalizeForComparison = text =>
            text.normalize('NFC')
                .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
                .replace(/\u0640/g, '')
                .replace(/[ٱأإآ]/g, 'ا')
                .replace(/ى/g, 'ي')
                .replace(/\s+/g, '');

        const layoutWords = testLayout.lines
            .filter(line => line.type === 'text')
            .flatMap(line => line.words);

        let previousIndex = -1;
        const mismatches = [];

        for (const item of layoutWords) {
            const [surah, ayah, wordNumber] =
                item.location.split(':').map(Number);

            const verseIndex = verses.findIndex(
                verse => verse.surah === surah && verse.ayah === ayah
            );

            const verseWords = tokens.filter(
                token => token.surah === surah && token.ayah === ayah
            );

            const basmalaOffset =
                surah !== 1 &&
                surah !== 9 &&
                ayah === 1 &&
                verseWords.slice(0, 4).every(
                    token => token.isOpeningBasmala
                )
                    ? 4
                    : 0;

            const token = verseWords[wordNumber - 1 + basmalaOffset];
            const globalIndex = tokens.indexOf(token);

            if (!token || globalIndex <= previousIndex) {
                mismatches.push({
                    location: item.location,
                    error: 'Missing or out-of-order word'
                });
                continue;
            }

            previousIndex = globalIndex;

            if (
                normalizeForComparison(token.text) !==
                normalizeForComparison(
                    item.word.replace(/[٠-٩0-9]/g, '')
                )
            ) {
                mismatches.push({
                    location: item.location,
                    tanzil: token.text,
                    layout: item.word
                });
            }
        }

        console.log('Text mismatches:', mismatches);
        console.log('Text match:', mismatches.length === 0);
        const pageWords = tokens.filter(
            token =>
                token.surah === 2 &&
                token.ayah >= 1 &&
                token.ayah <= 5 &&
                !token.isOpeningBasmala
        );

        console.log('Expected page words:', pageWords.length);
        console.log('Layout page words:', layoutWords.length);

        const expectedText = pageWords
            .map(token => normalizeForComparison(token.text));

        const actualText = layoutWords
            .map(item =>
                normalizeForComparison(
                    item.word.replace(/[٠-٩0-9]/g, '')
                )
            );

        const sequenceErrors = [];

        for (let i = 0; i < Math.max(expectedText.length, actualText.length); i++) {
            if (expectedText[i] !== actualText[i]) {
                sequenceErrors.push({
                    position: i + 1,
                    expected: pageWords[i]?.text ?? null,
                    actual: layoutWords[i]?.word ?? null
                });
            }
        }

        console.log('Sequence match:', sequenceErrors.length === 0);
        console.log('Sequence errors:', sequenceErrors);
        const baqarahFirstVerse = verses.find(
            verse => verse.surah === 2 && verse.ayah === 1
        );

        console.log('Baqarah 2:1:', baqarahFirstVerse?.text);

        console.log(
            'Baqarah 2:1 tokens:',
            tokens
                .filter(token => token.surah === 2 && token.ayah === 1)
                .map(token => token.text)
        );
        console.log('Valid:', validation.valid);
        console.log('Checked words:', validation.checkedWords);
        console.log('Errors:', JSON.stringify(validation.errors, null, 2));

        let offset = 0;

        verseTokenStarts = verses.map(verse => {
            const start = offset;

            while (
                offset < tokens.length &&
                tokens[offset].surah === verse.surah &&
                tokens[offset].ayah === verse.ayah
            ) {
                offset++;
            }

            return start;
        });

        if (offset !== tokens.length) {
            throw new Error('Quran token indexing mismatch');
        }

        if (
            verses.length !== 6236 ||
            PAGE_STARTS.length !== 604 ||
            PAGE_STARTS[603] >= verses.length
        ) {
            throw new Error('Invalid Quran page data');
        }

        const saved = loadReaderState();

        if (saved) {
            if (
                Number.isInteger(saved.displayPage) &&
                saved.displayPage >= 1 &&
                saved.displayPage <= TOTAL_PAGES
            ) {
                displayPage = saved.displayPage;
            } else {
                const savedIndex = clamp(
                    Number(saved.startIndex) || 0,
                    0,
                    tokens.length - 1
                );

                const verseIndex = verseTokenStarts
                    .findLastIndex(index => index <= savedIndex);

                displayPage = clamp(
                    PAGE_STARTS.findLastIndex(
                        index => index <= verseIndex
                    ) + 1,
                    1,
                    TOTAL_PAGES
                );
            }
        }

        if (document.fonts && document.fonts.load) {
            await Promise.race([
                document.fonts.load(
                    `${settings.fontSize}px "DigitalKhatt V2"`
                ),
                wait(1500)
            ]);
        }

        await nextFrame();

        async function loadMushafLayout(pageNumber) {
            const filename = String(pageNumber).padStart(3, '0');

            const response = await fetch(
                `./data/mushaf-layout/page-${filename}.json`
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to load mushaf layout for page ${pageNumber}`
                );
            }

            const data = await response.json();

            if (
                data.page !== pageNumber ||
                !Array.isArray(data.lines)
            ) {
                throw new Error('Invalid mushaf layout data');
            }

            return data;
        }

        function validateMushafLayout(layout) {
            const errors = [];
            let checkedWords = 0;

            for (const line of layout.lines) {
                if (line.type !== 'text') continue;

                for (const item of line.words) {
                    const [surah, ayah, wordIndex] =
                        item.location.split(':').map(Number);

                    const verse = verses.find(v =>
                        v.surah === surah && v.ayah === ayah
                    );

                    if (!verse) {
                        errors.push(`Missing verse: ${item.location}`);
                        continue;
                    }

                    const verseTokens = tokens.filter(t =>
                        t.surah === surah && t.ayah === ayah
                    );

                    const token = verseTokens[wordIndex - 1];

                    if (!token) {
                        errors.push(`Missing word: ${item.location}`);
                        continue;
                    }

                    checkedWords++;
                }
            }

            return {
                valid: errors.length === 0,
                checkedWords,
                errors
            };
        }        
        
        renderCurrentPage();

        els.loading.classList.add('is-hidden');

        setTimeout(() => {
            els.loading.remove();
        }, 260);

        // إعادة ضبط حجم الخط بعد تحميل الخط العثماني.
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                fitFixedPage();
            });
        }
    }

    function parseQuran(raw) {
        const parsed = [];

        for (const line of raw.split(/\r?\n/)) {
            if (!line || line.startsWith('#')) continue;

            const first = line.indexOf('|');
            const second = line.indexOf('|', first + 1);

            if (first < 1 || second < 0) continue;

            const surah = Number(line.slice(0, first));
            const ayah = Number(
                line.slice(first + 1, second)
            );
            const text = line.slice(second + 1).trim();

            if (
                !Number.isInteger(surah) ||
                !Number.isInteger(ayah) ||
                !text
            ) continue;

            parsed.push({ surah, ayah, text });
        }

        return parsed;
    }

    function buildTokens(items) {
        const result = [];

        for (const verse of items) {
            const words = [];
            const rawWords = verse.text.split(/\s+/).filter(Boolean);

            // علامات الوقف التي قد تظهر منفصلة بعد مسافة
            const stopMarks = new Set(['ۖ', 'ۚ', 'ۘ', 'ۗ', 'ۛ']);

            for (const word of rawWords) {
                if (stopMarks.has(word) && words.length > 0) {
                    // نربط العلامة بالكلمة السابقة للعرض فقط
                    words[words.length - 1] += word;
                } else {
                    words.push(word);
                }
            }

            // Tanzil uses a shadda on the initial ba in 95:1 and 97:1.
            // Recognize both source forms without normalizing displayed text.
            const hasOpeningBasmala = verse.ayah === 1 && verse.surah !== 9 &&
                ['بِسْمِ', 'بِّسْمِ'].includes(words[0]) &&
                words.slice(1, 4).join(' ') === items[0].text.split(/\s+/).slice(1).join(' ');

            words.forEach((word, index) => {
                result.push({
                    text: word,
                    surah: verse.surah,
                    ayah: verse.ayah,
                    isSurahStart: verse.ayah === 1 && index === 0,
                    // البسملة موجودة بالفعل في النص: نفصل عرض كلماتها فقط.
                    isOpeningBasmala: hasOpeningBasmala && index < 4,
                    isAyahEnd: index === words.length - 1
                });
            });
        }

        return result;
    }
    function renderMushafLines(layout) {
        const fragment = document.createDocumentFragment();

        for (const line of layout.lines) {
            if (line.type === 'surah-header') {
                fragment.appendChild(
                    createSurahHeading(Number(line.surah))
                );
                continue;
            }

            if (line.type === 'basmala') {
                const basmala = document.createElement('div');
                basmala.className = 'surah-basmala';
                basmala.textContent =
                    'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
                fragment.appendChild(basmala);
                continue;
            }

            if (line.type !== 'text') continue;

            const row = document.createElement('div');
            row.className = 'mushaf-line';

            for (const item of line.words) {
                const [surah, ayah, wordIndex] =
                    item.location.split(':').map(Number);

                const verseWords = tokens.filter(
                    token =>
                        token.surah === surah &&
                        token.ayah === ayah
                );

                const offset =
                    ayah === 1 &&
                    surah !== 1 &&
                    surah !== 9 &&
                    verseWords.slice(0, 4).every(
                        token => token.isOpeningBasmala
                    ) ? 4 : 0;

                const token = verseWords[wordIndex - 1 + offset];

                if (!token) {
                    throw new Error(
                        `Missing Quran word: ${item.location}`
                    );
                }

                if (row.childNodes.length) {
                    row.appendChild(document.createTextNode(' '));
                }

                row.appendChild(
                    document.createTextNode(token.text)
                );

                if (token.isAyahEnd) {
                    const marker = document.createElement('span');
                    marker.className = 'ayah-marker';
                    marker.textContent = toArabicDigits(ayah);
                    row.appendChild(marker);
                }
            }

            fragment.appendChild(row);
        }

        els.text.classList.add('madinah-layout');
        els.text.replaceChildren(fragment);
    }    
    // عرض صفحة من صفحات المصحف الأصلية.
    function renderCurrentPage() {
        displayPage = clamp(
            displayPage,
            1,
            TOTAL_PAGES
        );

        const verseStart = PAGE_STARTS[displayPage - 1];

        const verseEnd =
            displayPage === TOTAL_PAGES
                ? verses.length
                : PAGE_STARTS[displayPage];

        startIndex = verseTokenStarts[verseStart];

        endIndex =
            verseEnd === verses.length
                ? tokens.length
                : verseTokenStarts[verseEnd];

        if (displayPage === 2 && window.testMushafLayout) {
            renderMushafLines(window.testMushafLayout);
        } else {
            els.text.classList.remove('madinah-layout');
            renderRange(startIndex, endIndex);
        }

        updatePageMeta();
        saveReaderState();

        fitFixedPage();

        // الصفحة الجديدة تبدأ من فوق.
        els.text.scrollTop = 0;
    }

    // أكبر خط ممكن مع الحفاظ على حجم مقروء.
    function fitFixedPage() {
        const text = els.text;

        if (!text) return;

        const preferred = settings.fontSize;

        // لا نصغّر الخط تلقائيًا عن 26 بكسل.
        const minimum = Math.min(preferred, 26);

        text.style.fontSize = preferred + 'px';

        const availableHeight = text.clientHeight;

        if (availableHeight <= 0) return;

        // الخط المفضل مناسب بالفعل.
        if (
            text.scrollHeight <= availableHeight + 1
        ) {
            return;
        }

        // جرّب الحد الأدنى المقروء.
        text.style.fontSize = minimum + 'px';

        // لو لسه النص أطول من الصفحة،
        // نسيبه للتمرير بدل إخفائه.
        if (
            text.scrollHeight > availableHeight + 1
        ) {
            return;
        }

        // البحث عن أكبر حجم مناسب للشاشة.
        let low = minimum;
        let high = preferred;

        for (let i = 0; i < 8; i++) {
            const middle = (low + high) / 2;

            text.style.fontSize = middle + 'px';

            if (
                text.scrollHeight <=
                text.clientHeight + 1
            ) {
                low = middle;
            } else {
                high = middle;
            }
        }

        text.style.fontSize =
            low.toFixed(2) + 'px';
    }

    // Original geometric artwork; no third-party image assets or external SVG references.
    function createSurahHeading(surah) {
        const heading = document.createElement('header');
        heading.className = 'surah-heading';
        heading.dataset.surah = String(surah);
        // Hand-drawn vector botanicals, mirrored from a single side.
        // The supplied reference guides the frame, palette and floral composition.
        const leaf = (x, y, rotation, scale = 1) =>
            `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})">
                <path class="botanical-leaf" d="M0 0C-5-10-19-13-13-25C-9-33-4-33 0-42C3-31 15-31 14-21C14-11 3-9 0 0Z"/>
                <path class="botanical-vein" d="M0-3Q-4-18 0-33"/>
            </g>`;
        const flower = (x, y, radius = 1) => {
            const petals = Array.from({ length: 8 }, (_, i) =>
                `<path class="botanical-petal" transform="rotate(${i * 45})" d="M0-4C-8-10-14-17-8-24Q-3-27 0-35Q3-27 8-24C14-17 8-10 0-4Z"/>`
            ).join('');
            return `<g transform="translate(${x} ${y}) scale(${radius})">${petals}
                <path class="botanical-calyx" d="M0-17Q4-5 17 0Q4 5 0 17Q-4 5-17 0Q-4-5 0-17Z"/>
                <path class="botanical-heart" d="M0-7 6 0 0 7-6 0Z"/>
            </g>`;
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
        const side = `<g class="botanical-side">
            <path class="botanical-shadow" d="M41 112Q67 55 122 64Q176 48 212 69Q251 58 271 75Q254 99 227 112Q254 125 271 149Q251 166 212 155Q176 176 122 160Q67 169 41 112Z"/>
            <path class="botanical-stem-outline" d="${stems}"/>
            <path class="botanical-stem" d="${stems}"/>
            ${foliage}
            ${flower(139,112)}${flower(92,65,.32)}${flower(92,159,.32)}
            ${flower(181,95,.28)}${flower(181,129,.28)}${flower(240,66,.27)}${flower(240,158,.27)}
            <path class="botanical-gold-line" d="M50 112Q80 95 106 112Q80 129 50 112ZM217 112l11-7 11 7-11 7Z"/>
        </g>`;
        const cartouche = 'M342 54H658Q683 54 693 75Q711 71 720 88Q731 102 753 112Q731 122 720 136Q711 153 693 149Q683 170 658 170H342Q317 170 307 149Q289 153 280 136Q269 122 247 112Q269 102 280 88Q289 71 307 75Q317 54 342 54Z';
        const finial = `<path class="botanical-petal" d="M0 29C-6 17-15 15-16 5C-30 10-34-8-21-11C-21-26-9-28-6-38L0-50 6-38C9-28 21-26 21-11C34-8 30 10 16 5C15 15 6 17 0 29Z"/>
            <path class="botanical-calyx" d="M0 17C-4 4-13 2-12-9Q-3-7 0 3Q3-7 12-9C13 2 4 4 0 17ZM0-10Q-13-23 0-38Q13-23 0-10Z"/>
            <path class="botanical-vein" d="M0-35V11"/>`;
        heading.innerHTML = `<svg class="surah-ornament" viewBox="0 0 1000 224" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <path class="ornament-frame-outer" d="M28 40H972V184H28Z"/>
            <path class="ornament-frame-inner" d="M34 46H966V178H34Z"/>
            <path class="ornament-field" d="M41 53H959V171H41Z"/>
            ${side}<g transform="translate(1000 0) scale(-1 1)">${side}</g>
            <path class="ornament-cartouche-rim" d="${cartouche}"/>
            <path class="ornament-cartouche" d="${cartouche}"/>
            <g class="ornament-watermark" transform="translate(309 112) scale(.8)">${flower(0,0)}${leaf(22,-7,50,.65)}${leaf(22,7,130,.65)}</g>
            <g class="ornament-watermark" transform="translate(691 112) scale(-.8 .8)">${flower(0,0)}${leaf(22,-7,50,.65)}${leaf(22,7,130,.65)}</g>
            <g transform="translate(500 53) scale(.65)">${finial}</g>
            <g transform="translate(500 171) scale(.65 -.65)">${finial}</g>
            <g transform="translate(34 112) rotate(-90) scale(.5)">${finial}</g>
            <g transform="translate(966 112) rotate(90) scale(.5)">${finial}</g>
        </svg>`;
        const name = document.createElement('h2');
        name.className = 'surah-name';
        name.textContent = `سورة ${SURAH_NAMES[surah - 1]}`;
        heading.appendChild(name);
        return heading;
    }

    function renderRange(start, end) {
        const fragment = document.createDocumentFragment();

        let content = fragment;
        let basmala = null;

        for (let i = start; i < end; i++) {
            const token = tokens[i];

            if (token.isSurahStart) {
                fragment.appendChild(createSurahHeading(token.surah));
                basmala = null;
                if (token.isOpeningBasmala) {
                    basmala = document.createElement('div');
                    basmala.className = 'surah-basmala';
                    fragment.appendChild(basmala);
                }
            }
            content = token.isOpeningBasmala && basmala ? basmala : fragment;
            if (i > start && !token.isSurahStart) {
                content.appendChild(
                    document.createTextNode(' ')
                );
            }

            if (token.isAyahEnd) {
                const wrapped = document.createElement('span');

                wrapped.className = 'ayah-end-group';

                wrapped.appendChild(
                    document.createTextNode(token.text)
                );

                wrapped.appendChild(
                    document.createTextNode('\u00a0')
                );

                const marker = document.createElement('span');

                marker.className = 'ayah-marker';

                marker.setAttribute(
                    'aria-label',
                    `الآية ${token.ayah}`
                );

                marker.innerHTML = `
                    <svg class="ayah-ornament"
                        viewBox="0 0 100 100"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true">
                        <path class="ayah-flower-outer"
                            d="M50 3 L61 14 L76 10 L81 25 L96 31
                                L90 46 L97 59 L83 69 L81 85
                                L65 87 L50 98 L36 87 L19 85
                                L17 69 L3 59 L10 46 L4 31
                                L19 25 L24 10 L39 14 Z"/>
                        <circle class="ayah-flower-inner"
                                cx="50" cy="50" r="34"/>
                        <circle class="ayah-flower-ring"
                                cx="50" cy="50" r="29"/>
                    </svg>
                    <span class="ayah-number">${toArabicDigits(token.ayah)}</span>
                `;

                wrapped.appendChild(marker);
                content.appendChild(wrapped);
            } else {
                content.appendChild(
                    document.createTextNode(token.text)
                );
            }
        }

        els.text.replaceChildren(fragment);
    }

    function updatePageMeta() {
        const first = tokens[startIndex];
        const last = tokens[
            Math.max(startIndex, endIndex - 1)
        ];

        if (!first || !last) return;

        const firstName =
            SURAH_NAMES[first.surah - 1] || '';

        const lastName =
            SURAH_NAMES[last.surah - 1] || '';

        const sameSurah =
            first.surah === last.surah;

        const rangeText = sameSurah
            ? `الآيات ${toArabicDigits(first.ayah)}–${toArabicDigits(last.ayah)}`
            : `سورة ${firstName} ← سورة ${lastName}`;

        els.pageSurah.textContent =
            `سورة ${firstName}`;

        els.pageRange.textContent = rangeText;

        els.toolbarSurah.textContent = sameSurah
            ? `سورة ${firstName}`
            : `${firstName} ← ${lastName}`;

        els.toolbarRange.textContent = rangeText;

        els.displayPageNumber.textContent =
            toArabicDigits(displayPage);

        els.navPageNumber.textContent =
            toArabicDigits(displayPage);

        els.prev.disabled = displayPage <= 1;
        els.next.disabled = displayPage >= TOTAL_PAGES;

        document.title =
            `سورة ${firstName} · القرآن الكريم`;
    }

    let isTurningPage = false;

    function turnPage(direction) {
        if (isTurningPage) return;

        const targetPage = displayPage + direction;

        if (targetPage < 1 || targetPage > TOTAL_PAGES) {
            return;
        }

        isTurningPage = true;

        const page = els.page;

        // الصفحة التالية تتحرك ناحية اليمين
        const exitX = direction === 1 ? 65 : -65;
        const enterX = -exitX;

        const reduceMotion = window.matchMedia(
            '(prefers-reduced-motion: reduce)'
        ).matches;

        if (reduceMotion || !page.animate) {
            displayPage = targetPage;
            renderCurrentPage();
            isTurningPage = false;
            return;
        }

        // خروج الصفحة الحالية
        const exitAnimation = page.animate(
            [
                {
                    transform: 'translateX(0) rotateY(0deg)',
                    opacity: 1
                },
                {
                    transform: `translateX(${exitX}%) rotateY(${direction === 1 ? -12 : 12}deg)`,
                    opacity: 0
                }
            ],
            {
                duration: 140,
                easing: 'ease-in',
                fill: 'forwards'
            }
        );

        exitAnimation.finished.then(() => {
            displayPage = targetPage;
            renderCurrentPage();

            exitAnimation.cancel();

            // دخول الصفحة الجديدة من الاتجاه المقابل
            const enterAnimation = page.animate(
                [
                    {
                        transform: `translateX(${enterX}%) rotateY(${direction === 1 ? 12 : -12}deg)`,
                        opacity: 0
                    },
                    {
                        transform: 'translateX(0) rotateY(0deg)',
                        opacity: 1
                    }
                ],
                {
                    duration: 140,
                    easing: 'ease-out'
                }
            );

            enterAnimation.finished.then(() => {
                isTurningPage = false;
            }).catch(() => {
                isTurningPage = false;
            });

        }).catch(() => {
            isTurningPage = false;
        });
    }

    function nextPage() {
        turnPage(1);
    }

    function previousPage() {
        turnPage(-1);
    }

    function bindEvents() {
        els.next.addEventListener(
            'click',
            nextPage
        );

        els.prev.addEventListener(
            'click',
            previousPage
        );

        els.openSettings.addEventListener(
            'click',
            openSettings
        );

        els.closeSettings.addEventListener(
            'click',
            closeSettings
        );

        els.backdrop.addEventListener(
            'click',
            closeSettings
        );

        els.fontRange.addEventListener('input', () => {
            settings.fontSize =
                Number(els.fontRange.value);

            els.fontValue.value =
                String(settings.fontSize);

            applySettings(true);
        });

        els.lineRange.addEventListener('input', () => {
            settings.lineHeight =
                Number(els.lineRange.value);

            els.lineValue.value =
                settings.lineHeight.toFixed(2);

            applySettings(true);
        });

        els.themeButtons.forEach(button => {
            button.addEventListener('click', () => {
                settings.theme =
                    button.dataset.themeChoice;

                const preset =
                    THEMES[settings.theme];

                settings.paperColor = preset.paper;
                settings.textColor = preset.text;

                applySettings(true);
            });
        });

        els.paperColor.addEventListener('input', () => {
            settings.theme = 'custom';
            settings.paperColor =
                els.paperColor.value;

            applySettings(true, false);
        });

        els.textColor.addEventListener('input', () => {
            settings.theme = 'custom';
            settings.textColor =
                els.textColor.value;

            applySettings(true, false);
        });

        els.reset.addEventListener('click', () => {
            settings = defaultSettings();
            applySettings(true);
        });

        // التنقل بالكيبورد.
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                closeSettings();
                return;
            }

            if (isSettingsOpen()) return;

            const tag =
                document.activeElement?.tagName;

            if (
                tag === 'INPUT' ||
                tag === 'TEXTAREA' ||
                tag === 'SELECT'
            ) return;

            if (event.key === 'ArrowLeft') {
                nextPage();
            }

            if (event.key === 'ArrowRight') {
                previousPage();
            }
        });

        // بداية اللمس.
        els.stage.addEventListener(
            'pointerdown',
            event => {
                if (
                    event.pointerType === 'mouse' &&
                    event.button !== 0
                ) return;

                pointerStart = {
                    x: event.clientX,
                    y: event.clientY
                };
            }
        );

        // تحديد هل المستخدم بيسحب أفقيًا
        // أم بيحاول ينزل داخل الصفحة.
        els.stage.addEventListener(
            'pointerup',
            event => {
                if (
                    !pointerStart ||
                    isSettingsOpen()
                ) return;

                const dx =
                    event.clientX - pointerStart.x;

                const dy =
                    event.clientY - pointerStart.y;

                const distance =
                    Math.hypot(dx, dy);

                pointerStart = null;

                // السحب الأفقي فقط يقلب الصفحة.
                if (
                    Math.abs(dx) > 35 &&
                    Math.abs(dx) >
                    Math.abs(dy) * 1.25
                ) {
                    if (dx > 0) {
                        nextPage();
                    } else {
                        previousPage();
                    }

                    return;
                }

                // اللمسة العادية تظهر الأدوات.
                if (distance < 14) {
                    els.body.classList.toggle(
                        'tools-visible'
                    );
                }
            }
        );

        els.stage.addEventListener(
            'pointercancel',
            () => {
                pointerStart = null;
            }
        );

        // إعادة ضبط الخط عند تدوير الهاتف.
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);

            resizeTimer = setTimeout(() => {
                // حافظ على موضع التمرير أثناء تغيير الحجم.
                const scrollPosition =
                    els.text.scrollTop;

                fitFixedPage();

                els.text.scrollTop =
                    scrollPosition;
            }, 180);
        });
    }

    function openSettings() {
        els.backdrop.hidden = false;

        requestAnimationFrame(() => {
            els.settings.classList.add('is-open');
            els.backdrop.classList.add('is-open');
        });

        els.settings.setAttribute(
            'aria-hidden',
            'false'
        );

        els.body.classList.add(
            'settings-open',
            'tools-visible'
        );
    }

    function closeSettings() {
        if (!isSettingsOpen()) return;

        els.settings.classList.remove('is-open');
        els.backdrop.classList.remove('is-open');

        els.settings.setAttribute(
            'aria-hidden',
            'true'
        );

        els.body.classList.remove('settings-open');

        setTimeout(() => {
            if (!isSettingsOpen()) {
                els.backdrop.hidden = true;
            }
        }, 220);
    }

    function isSettingsOpen() {
        return els.settings.classList.contains(
            'is-open'
        );
    }

    function defaultSettings() {
        return {
            fontSize: window.matchMedia(
                '(min-width: 700px)'
            ).matches ? 38 : 34,

            lineHeight: 1.75,
            theme: 'paper',
            paperColor: THEMES.paper.paper,
            textColor: THEMES.paper.text
        };
    }

    function loadSettings() {
        const fallback = defaultSettings();

        try {
            const saved = JSON.parse(
                localStorage.getItem(SETTINGS_KEY) ||
                'null'
            );

            if (!saved) return fallback;

            return {
                fontSize: clamp(
                    Number(saved.fontSize) ||
                    fallback.fontSize,
                    24,
                    48
                ),

                lineHeight: clamp(
                    Number(saved.lineHeight) ||
                    fallback.lineHeight,
                    1.45,
                    2.05
                ),

                theme:
                    typeof saved.theme === 'string'
                        ? saved.theme
                        : fallback.theme,

                paperColor:
                    validHex(saved.paperColor)
                        ? saved.paperColor
                        : fallback.paperColor,

                textColor:
                    validHex(saved.textColor)
                        ? saved.textColor
                        : fallback.textColor
            };
        } catch (_) {
            return fallback;
        }
    }

    function applySettings(
        refit = false,
        debounce = true
    ) {
        const preset = THEMES[settings.theme];

        if (preset) {
            settings.paperColor = preset.paper;
            settings.textColor = preset.text;
        }

        els.body.dataset.theme = settings.theme;

        els.body.style.setProperty(
            '--reader-font-size',
            `${settings.fontSize}px`
        );

        els.body.style.setProperty(
            '--reader-line-height',
            String(settings.lineHeight)
        );

        els.body.style.setProperty(
            '--page-paper',
            settings.paperColor
        );

        els.body.style.setProperty(
            '--page-text',
            settings.textColor
        );

        els.body.style.setProperty(
            '--reader-accent',
            preset
                ? preset.accent
                : '#176B63'
        );

        els.fontRange.value =
            String(settings.fontSize);

        els.fontValue.value =
            String(settings.fontSize);

        els.lineRange.value =
            String(settings.lineHeight);

        els.lineValue.value =
            settings.lineHeight.toFixed(2);

        els.paperColor.value =
            settings.paperColor;

        els.textColor.value =
            settings.textColor;

        els.themeButtons.forEach(button => {
            button.classList.toggle(
                'is-active',
                button.dataset.themeChoice ===
                settings.theme
            );
        });

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(settings)
        );

        if (refit && tokens.length) {
            clearTimeout(resizeTimer);

            const run = () => {
                const oldScroll = els.text.scrollTop;

                fitFixedPage();

                els.text.scrollTop = oldScroll;
            };

            if (debounce) {
                resizeTimer = setTimeout(run, 80);
            } else {
                run();
            }
        }
    }

    function saveReaderState() {
        const first = tokens[startIndex];

        if (!first) return;

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                startIndex,
                displayPage,
                surah: first.surah,
                ayah: first.ayah
            })
        );
    }

    function loadReaderState() {
        try {
            const saved = JSON.parse(
                localStorage.getItem(STORAGE_KEY) ||
                'null'
            );

            return saved || null;
        } catch (_) {
            return null;
        }
    }

    function validHex(value) {
        return (
            typeof value === 'string' &&
            /^#[0-9a-f]{6}$/i.test(value)
        );
    }

    function toArabicDigits(value) {
        return String(value).replace(
            /\d/g,
            digit => '٠١٢٣٤٥٦٧٨٩'[digit]
        );
    }

    function clamp(value, min, max) {
        return Math.min(
            max,
            Math.max(min, value)
        );
    }

    function nextFrame() {
        return new Promise(resolve => {
            requestAnimationFrame(resolve);
        });
    }

    function wait(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }
})();
