(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const FAVORITES_KEY = 'adhkarFavoritesV2';
    const PROGRESS_KEY = 'adhkarProgressV2';
    const digits = value => String(value).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit]);
    const normalize = value => String(value || '')
        .normalize('NFKD')
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
        .replace(/[إأآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .toLowerCase();

    const CATEGORY_META = {
        daily: { label: 'اليوم والليلة' },
        prayer: { label: 'الصلاة والعبادة' },
        wellbeing: { label: 'الهم والمرض' },
        social: { label: 'الناس والأسرة' },
        travel: { label: 'السفر والطبيعة' },
        general: { label: 'أذكار وآداب' }
    };

    const CATEGORY_RULES = [
        ['prayer', ['صلاه', 'المسجد', 'اذان', 'الاذان', 'اقامه', 'ركوع', 'سجود', 'تشهد', 'استفتاح', 'قنوت', 'وتر', 'استخاره', 'بعد السلام']],
        ['wellbeing', ['هم', 'حزن', 'كرب', 'مرض', 'مريض', 'رقي', 'فزع', 'مصيبه', 'الشيطان', 'وسوس', 'حسد', 'حمى', 'الم في الجسد', 'الدين']],
        ['travel', ['سفر', 'ركوب', 'دابه', 'قريه', 'بلده', 'السوق', 'مطر', 'ريح', 'رعد', 'هلال', 'صعود', 'نزول', 'المسافر', 'منزل السفر']],
        ['social', ['زواج', 'مولود', 'تعزيه', 'العطاس', 'عطس', 'مجلس', 'الضيف', 'الاهل', 'اهله', 'الاخ', 'غضب', 'السلام علي', 'يرد السلام', 'احبك', 'اخيه']],
        ['daily', ['استيقاظ', 'النوم', 'الصباح', 'المساء', 'الخلاء', 'الوضوء', 'الثوب', 'المنزل', 'الطعام', 'الشراب', 'اللبن', 'الصائم', 'الافطار', 'الجماع', 'اللباس']]
    ];

    let chapters = [];
    let active = null;
    let filter = 'all';
    let query = '';
    let lastFocus = null;
    let favorites = new Set(readStorage(FAVORITES_KEY, []));

    const todayKey = () => {
        const now = new Date();
        return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    };

    const savedProgress = readStorage(PROGRESS_KEY, null);
    let progress = savedProgress?.date === todayKey() && savedProgress?.values
        ? savedProgress.values
        : {};
    saveProgress();

    function readStorage(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); }
        catch (_) { /* Persistence is helpful, not required for reading adhkar. */ }
    }

    function saveProgress() {
        writeStorage(PROGRESS_KEY, { date: todayKey(), values: progress });
    }

    function includesAny(text, words) {
        return words.some(word => text.includes(normalize(word)));
    }

    function categoryFor(chapter) {
        const title = normalize(chapter.title);
        for (const [category, words] of CATEGORY_RULES) {
            if (includesAny(title, words)) return category;
        }
        return 'general';
    }

    function categoryLabel(chapter) {
        return CATEGORY_META[categoryFor(chapter)]?.label || CATEGORY_META.general.label;
    }

    function chapterProgress(chapter) {
        let completed = 0;
        for (const item of chapter.items) {
            const total = Math.max(1, Number(item.count) || 1);
            if ((Number(progress[`${chapter.id}:${item.id}`]) || 0) >= total) completed++;
        }
        return completed;
    }

    function saveFavorites() {
        writeStorage(FAVORITES_KEY, [...favorites]);
    }

    function chapterCard(chapter) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chapter';
        button.dataset.id = String(chapter.id);

        const number = document.createElement('span');
        number.className = 'chapter-index';
        number.textContent = digits(chapter.id);

        const copy = document.createElement('span');
        copy.className = 'chapter-copy';
        const title = document.createElement('strong');
        title.textContent = chapter.title;
        const meta = document.createElement('small');
        const done = chapterProgress(chapter);
        const progressText = done ? ` • أُنجز ${digits(done)}/${digits(chapter.items.length)}` : '';
        meta.textContent = `${categoryLabel(chapter)} • ${digits(chapter.items.length)} ${chapter.items.length === 1 ? 'ذكر' : 'أذكار'}${progressText}${favorites.has(chapter.id) ? ' • ♥' : ''}`;
        copy.append(title, meta);

        const arrow = document.createElement('span');
        arrow.className = 'chapter-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '‹';
        button.append(number, copy, arrow);
        return button;
    }

    function renderList() {
        const normalizedQuery = normalize(query);
        const visible = chapters.filter(chapter => {
            const categoryMatches = filter === 'all'
                || (filter === 'saved' ? favorites.has(chapter.id) : categoryFor(chapter) === filter);
            if (!categoryMatches) return false;
            if (!normalizedQuery) return true;
            return normalize(chapter.title).includes(normalizedQuery)
                || chapter.items.some(item => normalize(item.text).includes(normalizedQuery)
                    || normalize(item.reference).includes(normalizedQuery));
        });

        $('chapter-list').replaceChildren(...visible.map(chapterCard));
        $('visible-count').textContent = `${digits(visible.length)} باب`;
        $('empty').hidden = visible.length > 0;
    }

    function repetitionLabel(total) {
        if (total === 1) return 'مرة واحدة';
        if (total === 2) return 'مرتان';
        if (total >= 3 && total <= 10) return `${digits(total)} مرات`;
        return `${digits(total)} مرة`;
    }

    function renderReader() {
        if (!active) return;
        const chapterIndex = chapters.findIndex(chapter => chapter.id === active.id);
        $('reader-label').textContent = categoryLabel(active);
        $('reader-title').textContent = active.title;
        $('reader-count').textContent = `${digits(active.items.length)} ${active.items.length === 1 ? 'ذكر ودعاء' : 'ذكرًا ودعاءً'}`;
        $('reader-position').textContent = `${digits(chapterIndex + 1)} / ${digits(chapters.length)}`;
        $('previous').disabled = chapterIndex === 0;
        $('next').disabled = chapterIndex === chapters.length - 1;
        $('reader-favorite').textContent = favorites.has(active.id) ? '♥' : '♡';
        $('reader-favorite').setAttribute('aria-pressed', String(favorites.has(active.id)));

        const nodes = active.items.map((item, index) => {
            const card = document.createElement('article');
            card.className = 'dhikr';

            const top = document.createElement('div');
            top.className = 'dhikr-top';
            const position = document.createElement('span');
            position.textContent = `الذكر ${digits(index + 1)} من ${digits(active.items.length)}`;
            const total = Math.max(1, Number(item.count) || 1);
            const countBadge = document.createElement('span');
            countBadge.className = 'count-badge';
            countBadge.textContent = repetitionLabel(total);
            top.append(position, countBadge);

            const text = document.createElement('p');
            text.className = 'dhikr-text';
            text.dir = 'rtl';
            text.textContent = item.text;

            const reference = document.createElement('div');
            reference.className = 'dhikr-reference';
            const referenceLabel = document.createElement('span');
            referenceLabel.textContent = 'المرجع';
            const referenceText = document.createElement('p');
            referenceText.textContent = item.reference || 'لم يُذكر مرجع في مصدر البيانات';
            reference.append(referenceLabel, referenceText);

            const bottom = document.createElement('div');
            bottom.className = 'dhikr-bottom';
            const helper = document.createElement('small');
            helper.textContent = total === 1 ? 'اضغط عند القراءة' : `كرّر الذكر ${repetitionLabel(total)}`;
            const button = document.createElement('button');
            button.className = 'repeat';
            button.type = 'button';
            const key = `${active.id}:${item.id}`;
            let current = Math.min(total, Math.max(0, Number(progress[key]) || 0));

            const paintCounter = () => {
                const done = current >= total;
                button.textContent = done ? '✓ اكتمل' : `تم ${digits(current)} / ${digits(total)}`;
                button.classList.toggle('done', done);
                button.disabled = done;
                button.setAttribute('aria-label', done
                    ? `اكتمل الذكر ${digits(index + 1)}`
                    : `تسجيل قراءة الذكر ${digits(index + 1)}: ${digits(current)} من ${digits(total)}`);
            };
            paintCounter();

            button.addEventListener('click', () => {
                if (current >= total) return;
                current++;
                progress[key] = current;
                saveProgress();
                paintCounter();
                renderList();
            });

            bottom.append(helper, button);
            card.append(top, text, reference, bottom);
            return card;
        });

        $('reader-items').replaceChildren(...nodes);
        $('reader-items').scrollTop = 0;
    }

    function openChapter(chapterOrId) {
        const found = typeof chapterOrId === 'object'
            ? chapterOrId
            : chapters.find(chapter => chapter.id === Number(chapterOrId));
        if (!found) return false;
        lastFocus = document.activeElement;
        active = found;
        renderReader();
        $('reader').hidden = false;
        document.body.classList.add('modal-open');
        $('close-reader').focus();
        history.replaceState(null, '', `#chapter=${active.id}`);
        return true;
    }

    function findChapterByTitleHint(hint) {
        const wanted = normalize(hint);
        return chapters.find(chapter => normalize(chapter.title).includes(wanted))
            || chapters.find(chapter => wanted.includes(normalize(chapter.title)));
    }

    function closeChapter() {
        active = null;
        $('reader').hidden = true;
        document.body.classList.remove('modal-open');
        history.replaceState(null, '', location.pathname + location.search);
        lastFocus?.focus();
    }

    function moveChapter(direction) {
        const index = chapters.findIndex(chapter => chapter.id === active?.id);
        const next = chapters[index + direction];
        if (!next) return;
        active = next;
        renderReader();
        history.replaceState(null, '', `#chapter=${active.id}`);
    }

    $('chapter-list').addEventListener('click', event => {
        const button = event.target.closest('[data-id]');
        if (button) openChapter(button.dataset.id);
    });

    document.querySelectorAll('[data-open-title]').forEach(button => button.addEventListener('click', () => {
        const chapter = findChapterByTitleHint(button.dataset.openTitle);
        if (chapter) {
            openChapter(chapter);
            return;
        }
        query = button.dataset.openTitle;
        $('search').value = query;
        renderList();
        $('library').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    $('search').addEventListener('input', event => {
        query = event.target.value;
        renderList();
    });

    $('filters').addEventListener('click', event => {
        const button = event.target.closest('[data-filter]');
        if (!button) return;
        filter = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach(candidate => candidate.classList.toggle('selected', candidate === button));
        renderList();
    });

    $('reader-favorite').addEventListener('click', () => {
        if (!active) return;
        favorites.has(active.id) ? favorites.delete(active.id) : favorites.add(active.id);
        saveFavorites();
        renderReader();
        renderList();
    });

    $('close-reader').addEventListener('click', closeChapter);
    document.querySelector('[data-close]').addEventListener('click', closeChapter);
    $('previous').addEventListener('click', () => moveChapter(-1));
    $('next').addEventListener('click', () => moveChapter(1));

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && active) closeChapter();
        if (event.key !== 'Tab' || !active) return;
        const focusable = [...$('reader').querySelectorAll('button:not(:disabled)')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    let theme = 'light';
    try { theme = localStorage.getItem('quranHomeTheme') || 'light'; }
    catch (_) { /* Use the light theme. */ }
    if (theme === 'dark') document.body.classList.add('dark');
    $('theme').textContent = document.body.classList.contains('dark') ? '☀' : '☾';
    $('theme').addEventListener('click', () => {
        document.body.classList.toggle('dark');
        const dark = document.body.classList.contains('dark');
        $('theme').textContent = dark ? '☀' : '☾';
        try { localStorage.setItem('quranHomeTheme', dark ? 'dark' : 'light'); }
        catch (_) { /* Theme persistence is optional. */ }
    });

    fetch('./data/adhkar.json')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load adhkar');
            return response.json();
        })
        .then(data => {
            chapters = data.filter(chapter => Number.isInteger(chapter.id)
                && typeof chapter.title === 'string'
                && Array.isArray(chapter.items));
            const itemCount = chapters.reduce((sum, chapter) => sum + chapter.items.length, 0);
            $('stat-chapters').textContent = `${digits(chapters.length)} بابًا`;
            $('stat-items').textContent = `${digits(itemCount)} ذكرًا ودعاءً`;
            renderList();
            const match = location.hash.match(/^#chapter=(\d+)$/);
            if (match) openChapter(Number(match[1]));
        })
        .catch(error => {
            console.error(error);
            $('chapter-list').textContent = 'تعذّر تحميل الأذكار من ملفات التطبيق.';
        });
})();
