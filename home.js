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

    // Hand-picked, self-contained verses. Text is read verbatim from the
    // same trusted local Quran source as the mushaf, never retyped here.
    const REFLECTION_VERSES = [
        [94, 5], [93, 5], [99, 7], [20, 46], [40, 60],
        [29, 69], [14, 7], [3, 139], [2, 153], [16, 97],
        [94, 6], [2, 152], [51, 56], [4, 86], [49, 13],
        [39, 10], [25, 63], [17, 36], [99, 8], [94, 8]
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
                    for (const line of raw.split(/\\r?\\n/)) {
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