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
    let gesture = null;
    let preview = null;
    let turning = false;
    let turnTimer = null;
    const SWIPE_THRESHOLD = 10;
    const TURN_DURATION = 175;

    function reducedMotion() {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    }

    function resetCardStyles(node) {
        if (!node) return;
        node.style.transition = '';
        node.style.transform = '';
    }

    function removePreview() {
        preview?.remove();
        preview = null;
    }

    function resetGesture(animate = true) {
        const card = content;
        const other = preview;
        const direction = gesture?.direction || 1;
        const width = card.getBoundingClientRect().width;
        gesture = null;
        if (!other) {
            resetCardStyles(card);
            return;
        }
        if (!animate || reducedMotion()) {
            resetCardStyles(card);
            removePreview();
            return;
        }
        card.style.transition = 'transform 180ms ease-out';
        other.style.transition = 'transform 180ms ease-out';
        card.style.transform = 'translateX(0)';
        other.style.transform = `translateX(${-direction * width}px)`;
        clearTimeout(turnTimer);
        turnTimer = setTimeout(() => {
            resetCardStyles(card);
            removePreview();
        }, 190);
    }

    function buildPreview(target, direction) {
        removePreview();
        const clone = content.cloneNode(true);
        clone.id = '';
        clone.setAttribute('aria-hidden', 'true');
        clone.classList.add('tafsir-swipe-preview');
        clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
        const rect = content.getBoundingClientRect();
        const sheetRect = sheet.getBoundingClientRect();
        const width = rect.width;
        clone.style.left = `${rect.left - sheetRect.left}px`;
        clone.style.top = `${rect.top - sheetRect.top}px`;
        clone.style.width = `${width}px`;
        clone.style.height = `${rect.height}px`;
        clone.scrollTop = content.scrollTop;
        clone.style.transform = `translateX(${-direction * width}px)`;
        sheet.insertBefore(clone, content.nextSibling);
        preview = clone;
        // The offline dataset is already cached in memory. Fill the preview
        // without changing the active ayah or triggering any requests.
        loadData().then(verses => {
            if (preview !== clone) return;
            const record = verses[target.verseKey];
            if (!record) return;
            const name = window.mushafReader?.getSurahName?.(target.surah);
            const ref = clone.querySelector('.tafsir-reference');
            const ayah = clone.querySelector('.tafsir-ayah-text');
            const explanationNode = clone.querySelector('.tafsir-explanation');
            if (ref) ref.textContent = `سورة ${name || digits(target.surah)} • الآية ${digits(target.ayah)}`;
            if (ayah) ayah.textContent = record.arabic_text || '';
            if (explanationNode) {
                explanationNode.textContent = record.translation || '';
                explanationNode.hidden = false;
            }
            const state = clone.querySelector('.tafsir-status');
            if (state) state.hidden = true;
            const retryNode = clone.querySelector('.tafsir-retry');
            if (retryNode) retryNode.hidden = true;
        }).catch(() => {});
    }

    function animateTurn(step) {
        if (turning || !sheet.classList.contains('is-open')) return;
        const target = adjacentVerse(activeVerse, step);
        if (!target) return;
        if (reducedMotion()) { showVerse(target); return; }
        turning = true;
        const width = content.getBoundingClientRect().width;
        const direction = step > 0 ? 1 : -1;
        buildPreview(target, direction);
        content.style.transition = `transform ${TURN_DURATION}ms ease-out`;
        if (preview) preview.style.transition = `transform ${TURN_DURATION}ms ease-out`;
        requestAnimationFrame(() => {
            content.style.transform = `translateX(${direction * width}px)`;
            if (preview) preview.style.transform = 'translateX(0)';
        });
        clearTimeout(turnTimer);
        turnTimer = setTimeout(() => {
            showVerse(target);
            resetCardStyles(content);
            removePreview();
            turning = false;
        }, TURN_DURATION + 20);
    }

    function finishGesture(current) {
        const target = current.target;
        const width = content.getBoundingClientRect().width;
        if (!target || Math.abs(current.dx) < Math.min(84, width * .2)) {
            gesture = current;
            resetGesture(true);
            return;
        }
        turning = true;
        content.style.transition = `transform ${TURN_DURATION}ms ease-out`;
        if (preview) preview.style.transition = `transform ${TURN_DURATION}ms ease-out`;
        content.style.transform = `translateX(${current.direction * width}px)`;
        if (preview) preview.style.transform = 'translateX(0)';
        clearTimeout(turnTimer);
        turnTimer = setTimeout(() => {
            showVerse(target);
            resetCardStyles(content);
            removePreview();
            turning = false;
        }, TURN_DURATION + 20);
    }

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
        animateTurn(step);
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
        clearTimeout(turnTimer);
        turning = false;
        gesture = null;
        resetCardStyles(content);
        removePreview();
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

    // Mirror the mushaf's interactive page swipe: drag the current tafsir
    // and the neighboring tafsir follows your finger. Release to complete
    // or bounce back, without interfering with vertical explanation scrolling.
    content.addEventListener('pointerdown', event => {
        if (turning || !sheet.classList.contains('is-open') ||
            !['touch', 'pen'].includes(event.pointerType) ||
            event.target.closest('button, a, input')) return;
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY,
            dx: 0, dragging: false, direction: 0, target: null };
    });
    content.addEventListener('pointermove', event => {
        if (!gesture || gesture.id !== event.pointerId || turning) return;
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        if (!gesture.dragging) {
            if (Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) {
                gesture = null;
                return;
            }
            if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.15) return;
            gesture.dragging = true;
            content.setPointerCapture?.(event.pointerId);
        }
        if (event.cancelable) event.preventDefault();
        const direction = dx > 0 ? 1 : -1;
        const target = adjacentVerse(activeVerse, direction);
        const effectiveDx = target ? dx : dx * .16;
        if (target && (!preview || gesture.direction !== direction)) {
            buildPreview(target, direction);
        } else if (!target) {
            removePreview();
        }
        gesture.dx = effectiveDx;
        gesture.direction = direction;
        gesture.target = target;
        content.style.transition = 'none';
        content.style.transform = `translateX(${effectiveDx}px)`;
        if (preview) {
            preview.style.transition = 'none';
            const width = content.getBoundingClientRect().width;
            preview.style.transform = `translateX(${effectiveDx - direction * width}px)`;
        }
    }, { passive: false });
    content.addEventListener('pointerup', event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        const current = gesture;
        gesture = null;
        if (!current.dragging) return;
        finishGesture(current);
    });
    content.addEventListener('pointercancel', event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        resetGesture(true);
    });
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
