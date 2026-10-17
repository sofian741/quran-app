(() => {
    'use strict';

    const SURAH_NAMES = [
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
    ];
    const TOTAL_PAGES = 604;
    const THEME_KEY = 'quranHomeTheme';
    const $ = id => document.getElementById(id);
    const arabicDigits = value => String(value).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit]);

    function readStorage(key) {
        try { return localStorage.getItem(key); }
        catch (_) { return null; }
    }

    function savedReading() {
        try {
            const saved = JSON.parse(readStorage('quranReaderState') || 'null');
            if (!saved || !Number.isInteger(saved.displayPage) ||
                saved.displayPage < 1 || saved.displayPage > TOTAL_PAGES) return null;
            return saved;
        } catch (_) {
            return null;
        }
    }

    function renderReading() {
        const saved = savedReading();
        const page = saved?.displayPage || 1;
        const surah = Number.isInteger(saved?.surah) && saved.surah >= 1 && saved.surah <= 114
            ? saved.surah : 1;
        const name = SURAH_NAMES[surah - 1];
        const ayah = Number.isInteger(saved?.ayah) && saved.ayah > 0
            ? ` • الآية ${arabicDigits(saved.ayah)}` : '';

        $('home-reading-title').textContent = saved ? `سورة ${name}` : 'المصحف الشريف';
        $('home-reading-location').textContent = saved
            ? `الصفحة ${arabicDigits(page)}${ayah}`
            : 'سورة الفاتحة • الصفحة ١';
        $('continue-title').textContent = saved ? 'أكمل القراءة' : 'ابدأ القراءة';
        $('home-progress-label').textContent = `${arabicDigits(page)} من ${arabicDigits(TOTAL_PAGES)} صفحة`;
        $('home-progress-fill').style.width = `${page / TOTAL_PAGES * 100}%`;
        $('home-progress-track').setAttribute('aria-valuenow', String(page));
        $('home-progress-track').setAttribute('aria-valuetext',
            `موضع القراءة: الصفحة ${arabicDigits(page)} من ${arabicDigits(TOTAL_PAGES)}`);
    }

    // Editorial shortlist: practical guidance, prayer, reassurance, accountability
    // and reflection. Do not pad this with arbitrary verses to hit a quota.
    // Expand only after contextual and tafsir review of new candidates.
    const REFLECTION_VERSES = [
        [2, 21],
        [2, 45],
        [2, 83],
        [2, 148],
        [2, 152],
        [2, 153],
        [2, 155],
        [2, 156],
        [2, 177],
        [2, 186],
        [2, 195],
        [2, 216],
        [2, 256],
        [2, 261],
        [2, 263],
        [2, 267],
        [2, 271],
        [2, 280],
        [2, 286],
        [3, 8],
        [3, 26],
        [3, 31],
        [3, 92],
        [3, 103],
        [3, 134],
        [3, 139],
        [3, 159],
        [3, 173],
        [3, 185],
        [3, 200],
        [4, 29],
        [4, 32],
        [4, 36],
        [4, 40],
        [4, 58],
        [4, 86],
        [4, 110],
        [4, 114],
        [4, 135],
        [4, 148],
        [5, 2],
        [5, 8],
        [5, 32],
        [5, 48],
        [5, 87],
        [5, 100],
        [6, 32],
        [6, 54],
        [6, 141],
        [6, 151],
        [6, 152],
        [6, 153],
        [6, 162],
        [7, 31],
        [7, 55],
        [7, 56],
        [7, 199],
        [7, 205],
        [8, 2],
        [8, 24],
        [8, 46],
        [8, 61],
        [9, 51],
        [9, 71],
        [9, 119],
        [9, 129],
        [10, 57],
        [10, 62],
        [10, 107],
        [11, 6],
        [11, 88],
        [11, 114],
        [11, 115],
        [12, 64],
        [12, 87],
        [12, 90],
        [13, 11],
        [13, 22],
        [13, 28],
        [14, 7],
        [14, 24],
        [14, 27],
        [14, 41],
        [15, 49],
        [16, 90],
        [16, 97],
        [16, 125],
        [17, 23],
        [17, 24],
        [17, 26],
        [17, 27],
        [17, 32],
        [17, 36],
        [17, 37],
        [17, 53],
        [18, 10],
        [18, 28],
        [18, 46],
        [18, 110],
        [19, 96],
        [20, 14],
        [20, 46],
        [20, 114],
        [21, 35],
        [21, 83],
        [21, 87],
        [21, 88],
        [22, 77],
        [23, 8],
        [23, 96],
        [23, 118],
        [24, 22],
        [24, 30],
        [24, 56],
        [25, 63],
        [25, 67],
        [25, 70],
        [25, 74],
        [26, 80],
        [27, 19],
        [28, 24],
        [28, 77],
        [29, 2],
        [29, 45],
        [29, 69],
        [30, 21],
        [30, 60],
        [31, 17],
        [31, 18],
        [31, 19],
        [33, 21],
        [33, 35],
        [33, 41],
        [33, 56],
        [33, 70],
        [34, 39],
        [35, 15],
        [35, 28],
        [35, 29],
        [38, 29],
        [39, 9],
        [39, 10],
        [39, 53],
        [40, 60],
        [41, 30],
        [41, 34],
        [41, 46],
        [42, 40],
        [42, 43],
        [45, 15],
        [47, 7],
        [49, 10],
        [49, 11],
        [49, 12],
        [49, 13],
        [51, 56],
        [53, 39],
        [53, 42],
        [54, 17],
        [57, 20],
        [57, 23],
        [58, 11],
        [59, 18],
        [59, 21],
        [60, 8],
        [61, 2],
        [61, 3],
        [63, 9],
        [64, 11],
        [64, 16],
        [65, 2],
        [65, 3],
        [65, 7],
        [67, 2],
        [67, 15],
        [68, 4],
        [70, 5],
        [71, 10],
        [73, 8],
        [73, 10],
        [74, 38],
        [76, 8],
        [76, 9],
        [79, 40],
        [80, 24],
        [82, 6],
        [84, 6],
        [85, 14],
        [87, 14],
        [87, 15],
        [89, 27],
        [89, 28],
        [90, 17],
        [91, 9],
        [92, 5],
        [92, 6],
        [93, 5],
        [93, 9],
        [93, 10],
        [93, 11],
        [94, 5],
        [94, 6],
        [94, 7],
        [94, 8],
        [95, 4],
        [96, 1],
        [99, 7],
        [99, 8],
        [102, 8],
        [103, 3],
        [107, 4],
        [109, 6],
        [110, 3],
        [112, 1],
        [2, 22],
        [2, 25],
        [2, 37],
        [2, 44],
        [2, 46],
        [2, 82],
        [2, 110],
        [2, 112],
        [2, 115],
        [2, 117],
        [2, 127],
        [2, 128],
        [2, 129],
        [2, 132],
        [2, 143],
        [2, 157],
        [2, 164],
        [2, 172],
        [2, 183],
        [2, 201],
        [2, 202],
        [2, 207],
        [2, 214],
        [2, 218],
        [2, 245],
        [2, 255],
        [2, 257],
        [2, 269],
        [2, 272],
        [2, 274],
        [2, 277],
        [2, 281],
        [2, 285],
        [3, 9],
        [3, 16],
        [3, 17],
        [3, 18],
        [3, 27],
        [3, 30],
        [3, 38],
        [3, 53],
        [3, 57],
        [3, 74],
        [3, 85],
        [3, 89],
        [3, 97],
        [3, 101],
        [3, 104],
        [3, 110],
        [3, 113],
        [3, 114],
        [3, 115],
        [3, 122],
        [3, 123],
        [3, 133],
        [3, 135],
        [3, 136],
        [3, 142],
        [3, 145],
        [3, 147],
        [3, 148],
        [3, 160],
        [3, 164],
        [3, 169],
        [3, 174],
        [3, 186],
        [3, 190],
        [3, 191],
        [3, 192],
        [3, 193],
        [3, 194],
        [3, 195],
        [3, 198],
        [3, 199],
        [4, 1],
        [4, 9],
        [4, 19],
        [4, 26],
        [4, 28],
        [4, 31],
        [4, 35],
        [4, 43],
        [4, 48],
        [4, 49],
        [4, 59],
        [4, 63],
        [4, 69],
        [4, 70],
        [4, 75],
        [4, 79],
        [4, 80],
        [4, 81],
        [4, 82],
        [4, 85],
        [4, 87],
        [4, 92],
        [4, 94],
        [4, 95],
        [4, 100],
        [4, 103],
        [4, 104],
        [4, 124],
        [4, 125],
        [4, 128],
        [4, 131],
        [4, 136],
        [4, 146],
        [4, 147],
        [4, 149],
        [4, 170],
        [4, 174],
        [4, 175],
        [5, 1],
        [5, 6],
        [5, 7],
        [5, 9],
        [5, 13],
        [5, 16],
        [5, 27],
        [5, 35],
        [5, 39],
        [5, 42],
        [5, 45],
        [5, 54],
        [5, 55],
        [5, 56],
        [5, 69],
        [5, 83],
        [5, 89],
        [5, 90],
        [5, 93],
        [5, 95],
        [5, 96],
        [5, 101],
        [5, 105],
        [5, 106],
        [5, 119],
        [6, 12],
        [6, 14],
        [6, 17],
        [6, 18],
        [6, 19],
        [6, 38],
        [6, 44],
        [6, 50],
        [6, 59],
        [6, 60],
        [6, 61],
        [6, 63],
        [6, 70],
        [6, 73],
        [6, 82],
        [6, 95],
        [6, 96],
        [6, 97],
        [6, 98],
        [6, 99],
        [6, 102],
        [6, 103],
        [6, 104],
        [6, 115],
        [6, 125],
        [6, 127],
        [6, 132],
        [6, 133],
        [6, 135],
        [6, 154],
        [6, 155],
        [6, 160],
        [6, 161],
        [6, 163],
        [6, 164],
        [7, 23],
        [7, 26],
        [7, 29],
        [7, 32],
        [7, 33],
        [7, 35],
        [7, 43],
        [7, 54],
        [7, 57],
        [7, 58],
        [7, 96],
        [7, 126],
        [7, 128],
        [7, 143],
        [7, 156],
        [7, 157],
        [7, 158],
        [7, 180],
        [7, 187],
        [7, 188],
        [7, 189],
        [7, 200],
        [7, 201],
        [7, 204],
        [7, 206],
        [8, 1],
        [8, 4],
        [8, 9],
        [8, 10],
        [8, 11],
        [8, 17],
        [8, 20],
        [8, 21],
        [8, 25],
        [8, 26],
        [8, 27],
        [8, 28],
        [8, 29],
        [8, 30],
        [8, 33],
        [8, 41],
        [8, 45],
        [8, 47],
        [8, 49],
        [8, 53],
        [8, 60],
        [8, 63],
        [8, 64],
        [8, 70],
        [8, 72],
        [8, 74],
        [9, 18],
        [9, 20],
        [9, 21],
        [9, 24],
        [9, 34],
        [9, 40],
        [9, 52],
        [9, 60],
        [9, 72],
        [9, 91],
        [9, 99],
        [9, 100],
        [9, 103],
        [9, 105],
        [9, 111],
        [9, 112],
        [9, 117],
        [9, 120],
        [9, 121],
        [9, 122],
        [9, 124],
        [9, 126],
        [9, 128],
        [10, 3],
        [10, 4],
        [10, 5],
        [10, 6],
        [10, 9],
        [10, 10],
        [10, 11],
        [10, 12],
        [10, 22],
        [10, 23],
        [10, 24],
        [10, 25],
        [10, 26],
        [10, 31],
        [10, 32],
        [10, 36],
        [10, 44],
        [10, 49],
        [10, 58],
        [10, 61],
        [10, 63],
        [10, 64],
        [10, 65],
        [10, 67],
        [10, 99],
        [10, 100],
        [10, 101],
        [10, 104],
        [10, 106],
        [10, 108],
        [10, 109],
    ];

    // Stable local calendar day: every approved verse is shown before the cycle repeats.
    function reflectionIndex(date = new Date()) {
        const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
        return ((day % REFLECTION_VERSES.length) + REFLECTION_VERSES.length) % REFLECTION_VERSES.length;
    }

    const reflectionKeys = new Set(REFLECTION_VERSES.map(([s, a]) => s + ':' + a));
    let reflectionDate = '';
    let reflectionVersesPromise = null;

    function loadReflectionVerses() {
        if (!reflectionVersesPromise) {
            reflectionVersesPromise = fetch('./data/quran-uthmani.txt')
                .then(response => {
                    if (!response.ok) throw new Error('Quran verse source unavailable');
                    return response.text();
                })
                .then(raw => {
                    const verses = new Map();
                    for (const line of raw.split(/\r?\n/)) {
                        if (!line || line.startsWith('#')) continue;
                        const first = line.indexOf('|');
                        const second = line.indexOf('|', first + 1);
                        if (first < 1 || second < 0) continue;
                        const key = line.slice(0, first) + ':' + line.slice(first + 1, second);
                        if (reflectionKeys.has(key)) {
                            verses.set(key, line.slice(second + 1).trim());
                        }
                    }
                    return verses;
                })
                .catch(error => {
                    reflectionVersesPromise = null;
                    throw error;
                });
        }
        return reflectionVersesPromise;
    }

    async function renderReflection() {
        const now = new Date();
        const dateKey = [now.getFullYear(), now.getMonth() + 1, now.getDate()].join('-');
        if (dateKey === reflectionDate) return;
        try {
            const verses = await loadReflectionVerses();
            const [surah, ayah] = REFLECTION_VERSES[reflectionIndex(now)];
            const verse = verses.get(surah + ':' + ayah);
            if (!verse) return; // Keep the existing fallback instead of showing inaccurate text.
            const blockquote = document.querySelector('.home-verse blockquote');
            const reference = document.querySelector('.home-verse-reference');
            const actions = document.querySelectorAll('.home-verse-action');
            if (!blockquote || !reference || actions.length < 2) return;
            blockquote.textContent = '﴿ ' + verse + ' ﴾';
            reference.textContent = 'من سورة ' + SURAH_NAMES[surah - 1] + ' • الآية ' + arabicDigits(ayah);
            actions[0].href = 'quran.html#verse=' + surah + ':' + ayah;
            actions[1].href = actions[0].href + '&action=tafsir';
            reflectionDate = dateKey;
        } catch (error) {
            console.warn('Daily reflection unavailable; keeping default verse.', error);
        }
    }

    function initialTheme() {
        const own = readStorage(THEME_KEY);
        if (own === 'light' || own === 'dark') return own;
        try {
            const reader = JSON.parse(readStorage('quranReaderSettings') || 'null');
            if (reader?.theme === 'dark') return 'dark';
        } catch (_) { /* Home remains usable without reader preferences. */ }
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        document.body.dataset.homeTheme = theme;
        const dark = theme === 'dark';
        const button = $('home-theme-toggle');
        button.setAttribute('aria-label', dark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي');
        button.title = dark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي';
        document.querySelector('meta[name="theme-color"]')
            ?.setAttribute('content', dark ? '#131d19' : '#f6f7f1');
    }

    applyTheme(initialTheme());
    renderReading();
    renderReflection();

    $('home-theme-toggle').addEventListener('click', () => {
        const theme = document.body.dataset.homeTheme === 'dark' ? 'light' : 'dark';
        applyTheme(theme);
        try { localStorage.setItem(THEME_KEY, theme); }
        catch (_) { /* Theme persistence is optional. */ }
    });

    // bfcache can restore a home snapshot that predates the latest reader position.
    window.addEventListener('pageshow', () => { renderReading(); renderReflection(); });
    // Check while the home page remains open across midnight.
    setInterval(() => { if (!document.hidden) renderReflection(); }, 60000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) { renderReading(); renderReflection(); }
    });
})();