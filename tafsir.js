(() => {
    'use strict';

    // Bundled QuranEnc data is used locally; no API requests are made while reading.
    const DATA_URL = './scripts/tafsir_muyassar.json';
    const sheet = document.getElementById('tafsir-sheet');
    const backdrop = document.getElementById('tafsir-backdrop');
    const closeButton = document.getElementById('close-tafsir');
    const action = document.querySelector('[data-verse-action="tafsir"]');
    const reference = document.getElementById('tafsir-reference');
    const ayahText = document.getElementById('tafsir-ayah-text');
    const explanation = document.getElementById('tafsir-explanation');
    const status = document.getElementById('tafsir-status');
    const retry = document.getElementById('tafsir-retry');
    const content = document.getElementById('tafsir-content');
    const previousButton = document.getElementById('tafsir-previous');
    const nextButton = document.getElementById('tafsir-next');
    const navPosition = document.getElementById('tafsir-nav-position');
    if (!sheet || !backdrop || !closeButton || !action || !reference ||
        !ayahText || !explanation || !status || !retry || !content ||
        !previousButton || !nextButton || !navPosition) return;

    const DIGITS = '٠١٢٣٤٥٦٧٨٩';
    let dataPromise = null;
    let activeVerse = null;
    let requestToken = 0;
    let hideTimer = null;

    function digits(value) {
        return String(value).replace(/\d/g, digit => DIGITS[Number(digit)]);
    }

    async function loadData() {
        if (!dataPromise) {
            dataPromise = (async () => {
                const response = await fetch(DATA_URL, { cache: 'force-cache' });
                if (!response.ok) throw new Error('Tafsir file unavailable: ' + response.status);
                const data = await response.json();
                if (data.api_key !== 'arabic_moyassar' ||
                    data.total_verses !== 6236 ||
                    !data.verses || Object.keys(data.verses).length !== 6236) {
                    throw new Error('Tafsir data is incomplete or invalid');
                }
                return data.verses;
            })().catch(error => {
                dataPromise = null; // A retry must attempt to read the file again.
                throw error;
            });
        }
        return dataPromise;
    }

    function adjacentVerse(verse, step) {
        // The audio module already includes the canonical 114 surah lengths.
        // Reuse it rather than duplicating a second, possibly divergent table.
        const counts = window.QuranAudio?.VERSE_COUNTS;
        if (!counts || !verse || (step !== 1 && step !== -1)) return null;
        let surah = verse.surah;
        let ayah = verse.ayah + step;
        if (ayah > counts[surah - 1]) {
            if (surah === counts.length) return null;
            surah++;
            ayah = 1;
        } else if (ayah < 1) {
            if (surah === 1) return null;
            surah--;
            ayah = counts[surah - 1];
        }
        return { surah, ayah, verseKey: `${surah}:${ayah}` };
    }

    function updateNavigation() {
        previousButton.disabled = !adjacentVerse(activeVerse, -1);
        nextButton.disabled = !adjacentVerse(activeVerse, 1);
        if (!activeVerse) {
            navPosition.textContent = '';
            return;
        }
        const total = window.QuranAudio?.VERSE_COUNTS?.[activeVerse.surah - 1];
        navPosition.textContent = total
            ? `الآية ${digits(activeVerse.ayah)} من ${digits(total)}`
            : `الآية ${digits(activeVerse.ayah)}`;
    }

    function navigate(step) {
        if (!sheet.classList.contains('is-open')) return;
        const verse = adjacentVerse(activeVerse, step);
        if (verse) showVerse(verse);
    }

    function showStatus(message, failed = false) {
        status.textContent = message;
        status.hidden = false;
        retry.hidden = !failed;
        explanation.hidden = true;
    }

    async function showVerse(verse) {
        const token = ++requestToken;
        const key = verse.verseKey;
        activeVerse = verse;
        updateNavigation();
        const name = window.mushafReader?.getSurahName?.(verse.surah);
        reference.textContent = `سورة ${name || digits(verse.surah)} • الآية ${digits(verse.ayah)}`;
        ayahText.textContent = '';
        explanation.textContent = '';
        showStatus('جاري تجهيز التفسير…');
        content.scrollTop = 0;
        try {
            const verses = await loadData();
            if (token !== requestToken || !sheet.classList.contains('is-open')) return;
            const record = verses[key];
            if (!record || !record.translation || !record.arabic_text ||
                Number(record.sura) !== verse.surah || Number(record.aya) !== verse.ayah) {
                throw new Error('Missing or mismatched verse: ' + key);
            }
            ayahText.textContent = record.arabic_text;
            explanation.textContent = record.translation;
            explanation.hidden = false;
            status.hidden = true;
            retry.hidden = true;
        } catch (error) {
            if (token !== requestToken || !sheet.classList.contains('is-open')) return;
            console.error('Unable to show tafsir:', error);
            showStatus('تعذّر عرض التفسير. تأكد من وجود ملف التفسير داخل المشروع، ثم حاول مجددًا.', true);
        }
    }

    function open(verse) {
        if (!verse || sheet.classList.contains('is-open')) return;
        clearTimeout(hideTimer);
        backdrop.hidden = false;
        sheet.setAttribute('aria-hidden', 'false');
        sheet.classList.add('is-open');
        requestAnimationFrame(() => backdrop.classList.add('is-open'));
        closeButton.focus({ preventScroll: true });
        showVerse(verse);
    }

    function close() {
        if (!sheet.classList.contains('is-open')) return;
        ++requestToken;
        activeVerse = null;
        updateNavigation();
        sheet.classList.remove('is-open');
        sheet.setAttribute('aria-hidden', 'true');
        backdrop.classList.remove('is-open');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => { backdrop.hidden = true; }, 250);
        document.getElementById('open-index')?.focus({ preventScroll: true });
    }

    action.addEventListener('click', () => {
        const verse = window.mushafVerseActions?.getSelectedVerse?.();
        if (!verse) return;
        window.mushafVerseActions.close();
        open(verse);
    });
    retry.addEventListener('click', () => {
        if (activeVerse) showVerse(activeVerse);
    });
    previousButton.addEventListener('click', () => navigate(-1));
    nextButton.addEventListener('click', () => navigate(1));

    // In the right-to-left mushaf, swiping left advances to the next ayah;
    // swiping right goes back. Vertical scrolling stays untouched.
    let swipeStart = null;
    content.addEventListener('touchstart', event => {
        swipeStart = event.touches.length === 1
            ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
            : null;
    }, { passive: true });
    content.addEventListener('touchend', event => {
        if (!swipeStart || !event.changedTouches.length) return;
        const dx = event.changedTouches[0].clientX - swipeStart.x;
        const dy = event.changedTouches[0].clientY - swipeStart.y;
        swipeStart = null;
        if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
            navigate(dx < 0 ? 1 : -1);
        }
    }, { passive: true });
    content.addEventListener('touchcancel', () => { swipeStart = null; }, { passive: true });
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', event => {
        if (!sheet.classList.contains('is-open')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            event.stopImmediatePropagation();
            navigate(event.key === 'ArrowLeft' ? 1 : -1);
        } else if (event.key === 'Tab') {
            // Keep keyboard focus inside the tafsir dialog, including navigation.
            const controls = [closeButton, retry, previousButton, nextButton,
                ...sheet.querySelectorAll('a[href]')]
                .filter(element => !element.hidden && !element.disabled && element.getClientRects().length);
            if (!controls.length) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }, true);
    // Warm the bundled file after the reader starts, to avoid delaying page layout.
    const warm = () => { loadData().catch(() => {}); };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 4500 });
    else window.addEventListener('load', () => setTimeout(warm, 1000), { once: true });
})();
