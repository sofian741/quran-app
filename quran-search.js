(() => {
    'use strict';

    // Search the exact 6,236 validated verses already loaded by the mushaf.
    // No third-party service, network request, or alternate Quran text.
    const $ = id => document.getElementById(id);
    const trigger = $('open-quran-search');
    const sheet = $('quran-search-sheet');
    const backdrop = $('quran-search-backdrop');
    const closeButton = $('close-quran-search');
    const input = $('quran-search-input');
    const surahSelect = $('quran-search-surah');
    const results = $('quran-search-results');
    const status = $('quran-search-status');
    const more = $('quran-search-more');
    if (![trigger, sheet, backdrop, closeButton, input, surahSelect, results, status, more].every(Boolean)) return;

    const DIGITS = '٠١٢٣٤٥٦٧٨٩';
    const PAGE_SIZE = 30;
    let indexedVerses = null;
    let matches = [];
    let visible = 0;
    let searchTimer = null;
    let closeTimer = null;
    let activeQuery = '';
    let highlightTimer = null;

    const digits = value => String(value).replace(/\d/g, n => DIGITS[Number(n)]);

    // Normalization is deliberately conservative: ignore Quranic vowel/recitation
    // marks and common Arabic letter variants, without altering the source verse.
    function foldChar(char) {
        return char.normalize('NFKC')
            .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '')
            .replace(/[أإآٱٲٳٵ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ؤ/g, 'و')
            .replace(/ئ/g, 'ي')
            .replace(/[\u06DD\u06DE\u06E9\u06FD\u06FE]/g, '')
            .replace(/[،؛؟.,:!\-–—()\[\]{}\u06D4]/g, ' ')
            .toLowerCase();
    }

    function normalizedWithMap(raw, expandSmallAlif = false) {
        let text = '';
        const map = [];
        let offset = 0;
        for (const char of raw) {
            const start = offset;
            offset += char.length;
            // Some Uthmani spellings write a small alif where standard
            // Arabic uses a full alif (e.g. الصِّرَٰط). Search both forms.
            for (const folded of (expandSmallAlif && char === '\u0670' ? 'ا' : foldChar(char))) {
                if (/\s/.test(folded)) {
                    if (text && text[text.length - 1] !== ' ') {
                        text += ' ';
                        map.push(start);
                    }
                } else {
                    text += folded;
                    map.push(start);
                }
            }
        }
        if (text.endsWith(' ')) {
            text = text.slice(0, -1);
            map.pop();
        }
        return { text, map };
    }

    function normalize(raw) {
        return normalizedWithMap(raw.trim()).text;
    }

    function ensureIndex() {
        if (indexedVerses) return true;
        const verses = window.mushafReader?.getSearchVerses?.();
        if (!Array.isArray(verses) || verses.length !== 6236) return false;
        indexedVerses = verses.map(verse => ({
            surah: verse.surah,
            ayah: verse.ayah,
            text: verse.text,
            normalized: normalize(verse.text),
            normalizedAlif: normalizedWithMap(verse.text, true).text
        }));
        for (let surah = 1; surah <= 114; surah++) {
            const option = document.createElement('option');
            option.value = String(surah);
            option.textContent = 'سورة ' + (window.mushafReader?.getSurahName?.(surah) || digits(surah));
            surahSelect.appendChild(option);
        }
        return true;
    }

    function clearTargetHighlight() {
        clearTimeout(highlightTimer);
        document.querySelectorAll('.mushaf-word.is-search-target').forEach(node =>
            node.classList.remove('is-search-target'));
    }

    function highlightVerse(surah, ayah) {
        clearTargetHighlight();
        const key = `${surah}:${ayah}`;
        document.querySelectorAll('#quran-text .mushaf-word').forEach(word => {
            if (word.dataset.verse === key) word.classList.add('is-search-target');
        });
        const first = document.querySelector('#quran-text .mushaf-word.is-search-target');
        first?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        highlightTimer = setTimeout(clearTargetHighlight, 5500);
    }

    function navigateToVerse(verse) {
        close(false);
        const reader = window.mushafReader;
        if (reader?.goToVerse(verse.surah, verse.ayah)) {
            requestAnimationFrame(() => highlightVerse(verse.surah, verse.ayah));
        } else {
            status.textContent = 'تعذّر فتح الآية الآن. أعد المحاولة بعد إغلاق النوافذ الأخرى.';
            open();
        }
    }

    function openTafsir(verse) {
        if (!window.mushafTafsir?.open) {
            status.textContent = 'التفسير غير جاهز بعد. حاول مرة أخرى.';
            return;
        }
        close(false);
        // Let the search sheet finish its exit animation before the tafsir
        // sheet opens. This is the existing offline tafsir, not a duplicate.
        setTimeout(() => window.mushafTafsir.open({
            surah: verse.surah, ayah: verse.ayah,
            verseKey: `${verse.surah}:${verse.ayah}`
        }), window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 260);
    }

    function appendHighlightedText(parent, verse) {
        let { text, map } = normalizedWithMap(verse.text);
        let start = text.indexOf(activeQuery);
        if (start < 0) {
            ({ text, map } = normalizedWithMap(verse.text, true));
            start = text.indexOf(activeQuery);
        }
        if (start < 0 || !map.length) {
            parent.textContent = verse.text;
            return;
        }
        const from = map[start];
        const last = map[Math.min(map.length - 1, start + activeQuery.length - 1)];
        const to = last + (verse.text.codePointAt(last) > 0xFFFF ? 2 : 1);
        parent.append(document.createTextNode(verse.text.slice(0, from)));
        const mark = document.createElement('mark');
        mark.textContent = verse.text.slice(from, to);
        parent.append(mark, document.createTextNode(verse.text.slice(to)));
    }

    function createResult(verse) {
        const article = document.createElement('article');
        article.className = 'quran-search-result';
        const title = document.createElement('div');
        title.className = 'quran-search-result-title';
        const surahName = window.mushafReader?.getSurahName?.(verse.surah) || digits(verse.surah);
        const page = window.mushafReader?.findVersePage?.(verse.surah, verse.ayah);
        title.textContent = `سورة ${surahName} • الآية ${digits(verse.ayah)}` +
            (page ? ` • صفحة ${digits(page)}` : '');

        const text = document.createElement('p');
        text.className = 'quran-search-result-ayah';
        text.lang = 'ar';
        appendHighlightedText(text, verse);

        const actions = document.createElement('div');
        actions.className = 'quran-search-result-actions';
        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'quran-search-go';
        go.textContent = 'اذهب للآية';
        go.setAttribute('aria-label', `الانتقال إلى سورة ${surahName} الآية ${verse.ayah}`);
        go.addEventListener('click', () => navigateToVerse(verse));

        const tafsir = document.createElement('button');
        tafsir.type = 'button';
        tafsir.className = 'quran-search-tafsir';
        tafsir.textContent = 'التفسير';
        tafsir.setAttribute('aria-label', `تفسير سورة ${surahName} الآية ${verse.ayah}`);
        tafsir.addEventListener('click', () => openTafsir(verse));
        actions.append(go, tafsir);
        article.append(title, text, actions);
        return article;
    }

    function showMore() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(matches.length, visible + PAGE_SIZE);
        for (let i = visible; i < end; i++) fragment.appendChild(createResult(matches[i]));
        results.appendChild(fragment);
        visible = end;
        more.hidden = visible >= matches.length;
        if (!more.hidden) more.textContent = `عرض نتائج أكثر (${digits(matches.length - visible)} متبقية)`;
    }

    function performSearch() {
        clearTimeout(searchTimer);
        if (!sheet.classList.contains('is-open')) return;
        if (!ensureIndex()) {
            status.textContent = 'جاري تجهيز بيانات المصحف للبحث…';
            return;
        }
        activeQuery = normalize(input.value);
        matches = [];
        visible = 0;
        results.replaceChildren();
        more.hidden = true;
        if (!activeQuery) {
            status.textContent = 'اكتب كلمة أو جزءًا من آية لبدء البحث.';
            return;
        }
        const scope = surahSelect.value;
        matches = indexedVerses.filter(verse =>
            (scope === 'all' || verse.surah === Number(scope)) &&
            (verse.normalized.includes(activeQuery) || verse.normalizedAlif.includes(activeQuery)));
        status.textContent = matches.length
            ? `تم العثور على ${digits(matches.length)} آية مطابقة`
            : 'لا توجد نتائج مطابقة. جرّب كلمة أخرى أو ابحث في جميع السور.';
        if (matches.length) showMore();
    }

    function scheduleSearch() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(performSearch, 140);
    }

    function open() {
        if (sheet.classList.contains('is-open')) return;
        // The search entry is inside settings. Close those first so the
        // reader's goToVerse method is not blocked by the settings sheet.
        if (document.getElementById('settings-sheet')?.classList.contains('is-open')) {
            document.getElementById('close-settings')?.click();
        }
        clearTimeout(closeTimer);
        backdrop.hidden = false;
        sheet.inert = false;
        sheet.classList.add('is-open');
        sheet.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => backdrop.classList.add('is-open'));
        if (!ensureIndex()) status.textContent = 'جاري تجهيز بيانات المصحف للبحث…';
        else performSearch();
        input.focus({ preventScroll: true });
    }

    function close(restoreFocus = true) {
        if (!sheet.classList.contains('is-open')) return;
        clearTimeout(searchTimer);
        sheet.classList.remove('is-open');
        sheet.setAttribute('aria-hidden', 'true');
        sheet.inert = true;
        backdrop.classList.remove('is-open');
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => { backdrop.hidden = true; }, 240);
        if (restoreFocus) document.getElementById('open-settings')?.focus({ preventScroll: true });
    }

    sheet.inert = true;
    trigger.addEventListener('click', open);
    closeButton.addEventListener('click', () => close());
    backdrop.addEventListener('click', () => close());
    input.addEventListener('input', scheduleSearch);
    surahSelect.addEventListener('change', performSearch);
    more.addEventListener('click', showMore);
    window.addEventListener('mushaf:data-ready', () => {
        if (sheet.classList.contains('is-open')) performSearch();
    });
    window.addEventListener('mushaf:page-changed', clearTargetHighlight);

    document.addEventListener('keydown', event => {
        if (!sheet.classList.contains('is-open')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            // Prevent the reader's global arrow shortcuts while searching.
            event.stopPropagation();
        } else if (event.key === 'Tab') {
            const controls = [closeButton, input, surahSelect,
                ...results.querySelectorAll('button'), more]
                .filter(node => !node.hidden && !node.disabled && node.getClientRects().length);
            if (!controls.length) return;
            if (event.shiftKey && document.activeElement === controls[0]) {
                event.preventDefault();
                controls[controls.length - 1].focus();
            } else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) {
                event.preventDefault();
                controls[0].focus();
            }
        }
    }, true);
})();
