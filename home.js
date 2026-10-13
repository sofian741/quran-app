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
    const $ = id => document.getElementById(id);
    const arabicDigits = value => String(value).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit]);
    const TOTAL_PAGES = 604;

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
        } catch (_) { return null; }
    }

    function renderReading() {
        const saved = savedReading();
        const page = saved?.displayPage || 1;
        const surah = Number.isInteger(saved?.surah) && saved.surah >= 1 && saved.surah <= 114
            ? saved.surah : 1;
        const name = SURAH_NAMES[surah - 1];
        const ayah = Number.isInteger(saved?.ayah) && saved.ayah > 0
            ? ` • الآية ${arabicDigits(saved.ayah)}` : '';
        $('home-reading-title').textContent = saved
            ? `سورة ${name}` : 'ابدأ رحلتك مع القرآن';
        $('home-reading-location').textContent = `سورة ${name} • الصفحة ${arabicDigits(page)}${ayah}`;
        $('continue-title').textContent = saved ? 'أكمل القراءة' : 'ابدأ القراءة';
        $('home-progress-label').textContent = `${arabicDigits(page)} من ${arabicDigits(TOTAL_PAGES)} صفحة`;
        $('home-progress-fill').style.width = `${page / TOTAL_PAGES * 100}%`;
        $('home-progress-track').setAttribute('aria-valuenow', String(page));
        $('home-progress-track').setAttribute('aria-valuetext',
            `موضع القراءة: الصفحة ${arabicDigits(page)} من ${arabicDigits(TOTAL_PAGES)}`);
    }

    function renderDate() {
        const date = $('home-date');
        try {
            const today = new Date();
            const hijri = new Intl.DateTimeFormat('ar-EG-u-ca-islamic', {
                day: 'numeric', month: 'long', year: 'numeric'
            }).format(today);
            const weekday = new Intl.DateTimeFormat('ar-EG', { weekday: 'long' }).format(today);
            date.textContent = `${weekday} • ${hijri}`;
            date.title = 'التاريخ الهجري محسوب تقريبيًا وقد يختلف بحسب رؤية الهلال';
        } catch (_) {
            date.textContent = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long' }).format(new Date());
        }
    }

    const THEME_KEY = 'quranHomeTheme';
    function initialTheme() {
        const own = readStorage(THEME_KEY);
        if (own === 'light' || own === 'dark') return own;
        try {
            const reader = JSON.parse(readStorage('quranReaderSettings') || 'null');
            if (reader?.theme === 'dark') return 'dark';
        } catch (_) { /* The home can work without reader preferences. */ }
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        document.body.dataset.homeTheme = theme;
        const dark = theme === 'dark';
        const button = $('home-theme-toggle');
        button.setAttribute('aria-label', dark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي');
        button.title = dark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي';
        document.querySelector('meta[name="theme-color"]')
            ?.setAttribute('content', dark ? '#141e1a' : '#f7f8f3');
    }

    applyTheme(initialTheme());
    renderDate();
    renderReading();
    $('home-theme-toggle').addEventListener('click', () => {
        const theme = document.body.dataset.homeTheme === 'dark' ? 'light' : 'dark';
        applyTheme(theme);
        try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* Optional. */ }
    });

    // Browser back/forward cache can restore a home page that predates the
    // latest reader position. Refresh it whenever the home becomes visible.
    window.addEventListener('pageshow', renderReading);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) renderReading();
    });
})();
