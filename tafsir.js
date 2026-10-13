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
    if (!sheet || !backdrop || !closeButton || !action || !reference ||
        !ayahText || !explanation || !status || !retry || !content) return;

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
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', event => {
        if (!sheet.classList.contains('is-open')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
        } else if (event.key === 'Tab') {
            // Keep keyboard focus inside the tafsir dialog.
            const controls = [closeButton, retry, ...sheet.querySelectorAll('a[href]')]
                .filter(element => !element.hidden && element.getClientRects().length);
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
