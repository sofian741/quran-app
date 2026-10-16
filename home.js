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

    // Broad candidate pool spanning the Quran. Each reference should be
    // reviewed for stand-alone meaning before the collection is finalized.
    const REFLECTION_VERSES = [
        [2, 21],
        [2, 45],
        [2, 83],
        [2, 152],
        [2, 153],
        [2, 186],
        [2, 195],
        [2, 256],
        [2, 263],
        [2, 286],
        [3, 8],
        [3, 26],
        [3, 31],
        [3, 92],
        [3, 103],
        [3, 139],
        [3, 159],
        [3, 185],
        [3, 200],
        [4, 36],
        [4, 40],
        [4, 58],
        [4, 86],
        [4, 110],
        [4, 135],
        [5, 2],
        [5, 8],
        [5, 32],
        [5, 100],
        [6, 32],
        [6, 59],
        [6, 141],
        [6, 151],
        [6, 162],
        [7, 31],
        [7, 56],
        [7, 199],
        [8, 2],
        [8, 46],
        [9, 51],
        [9, 71],
        [9, 119],
        [10, 57],
        [10, 62],
        [10, 107],
        [11, 6],
        [11, 88],
        [11, 114],
        [12, 18],
        [12, 87],
        [12, 90],
        [13, 11],
        [13, 28],
        [14, 7],
        [14, 34],
        [14, 41],
        [15, 49],
        [15, 99],
        [16, 18],
        [16, 90],
        [16, 97],
        [16, 125],
        [17, 23],
        [17, 24],
        [17, 26],
        [17, 32],
        [17, 36],
        [17, 37],
        [17, 70],
        [18, 10],
        [18, 23],
        [18, 24],
        [18, 46],
        [18, 110],
        [19, 96],
        [20, 46],
        [20, 114],
        [21, 35],
        [21, 87],
        [21, 107],
        [22, 77],
        [23, 1],
        [23, 96],
        [23, 118],
        [24, 30],
        [24, 35],
        [25, 63],
        [25, 74],
        [26, 80],
        [27, 19],
        [27, 40],
        [28, 24],
        [28, 77],
        [29, 2],
        [29, 45],
        [29, 69],
        [30, 21],
        [30, 30],
        [30, 60],
        [31, 14],
        [31, 17],
        [31, 18],
        [31, 19],
        [32, 16],
        [33, 21],
        [33, 35],
        [33, 41],
        [33, 56],
        [34, 39],
        [35, 15],
        [35, 28],
        [36, 82],
        [37, 96],
        [38, 29],
        [39, 9],
        [39, 10],
        [39, 53],
        [39, 73],
        [40, 44],
        [40, 60],
        [41, 30],
        [41, 34],
        [42, 40],
        [42, 43],
        [43, 67],
        [44, 38],
        [45, 15],
        [46, 15],
        [47, 7],
        [48, 4],
        [49, 10],
        [49, 11],
        [49, 12],
        [49, 13],
        [50, 16],
        [51, 56],
        [52, 48],
        [53, 39],
        [53, 42],
        [54, 17],
        [55, 13],
        [56, 77],
        [57, 4],
        [57, 20],
        [57, 23],
        [57, 25],
        [58, 11],
        [59, 18],
        [59, 21],
        [60, 8],
        [61, 2],
        [62, 9],
        [63, 9],
        [64, 11],
        [64, 16],
        [65, 2],
        [65, 3],
        [65, 7],
        [66, 6],
        [67, 2],
        [67, 15],
        [68, 4],
        [69, 52],
        [70, 5],
        [71, 10],
        [71, 11],
        [72, 18],
        [73, 8],
        [74, 38],
        [75, 14],
        [76, 8],
        [76, 9],
        [77, 50],
        [78, 39],
        [79, 40],
        [79, 41],
        [80, 24],
        [81, 29],
        [82, 6],
        [83, 6],
        [84, 6],
        [85, 14],
        [86, 9],
        [87, 14],
        [87, 15],
        [88, 21],
        [89, 27],
        [89, 28],
        [90, 4],
        [90, 17],
        [91, 9],
        [92, 5],
        [92, 6],
        [93, 5],
        [94, 5],
        [94, 6],
        [94, 7],
        [94, 8],
        [95, 4],
        [96, 1],
        [97, 3],
        [98, 5],
        [99, 7],
        [99, 8],
        [100, 11],
        [101, 11],
        [102, 8],
        [103, 1],
        [103, 2],
        [103, 3],
        [104, 1],
        [106, 3],
        [107, 4],
        [108, 1],
        [109, 6],
        [110, 3],
        [112, 1],
        [113, 1],
        [114, 1]
    ];

    // Stable local calendar day: revisiting the home page does not reshuffle it.
    function reflectionIndex(date = new Date()) {
        const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
        return ((day % REFLECTION_VERSES.length) + REFLECTION_VERSES.length) % REFLECTION_VERSES.length;
    }

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
                        if (REFLECTION_VERSES.some(([s, a]) => key === s + ':' + a)) {
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
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) { renderReading(); renderReflection(); }
    });
})();