(() => {
    'use strict';

    const text = document.getElementById('quran-text');
    const stage = document.getElementById('reader-stage');
    const sheet = document.getElementById('verse-actions-sheet');
    const backdrop = document.getElementById('verse-actions-backdrop');
    const closeButton = document.getElementById('close-verse-actions');
    const reference = document.getElementById('verse-actions-reference');
    if (!text || !stage || !sheet || !backdrop || !closeButton || !reference) return;

    const HOLD_MS = 500;
    const MOVE_TOLERANCE = 12;
    const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
    let pending = null;
    let selectedVerse = null;
    let suppressClick = false;
    let closeTimer = null;
    let lastFocus = null;

    function toArabicDigits(number) {
        return String(number).replace(/\d/g, digit => ARABIC_DIGITS[Number(digit)]);
    }

    function verseFromTarget(target) {
        if (!(target instanceof Element) || !text.contains(target)) return null;
        const word = target.closest('.mushaf-word[data-verse]') ||
            target.closest('.ayah-end-group')?.querySelector('.mushaf-word[data-verse]');
        if (!word || !text.contains(word)) return null;
        const match = /^(\d{1,3}):(\d{1,3})$/.exec(word.dataset.verse || '');
        if (!match) return null;
        const surah = Number(match[1]);
        const ayah = Number(match[2]);
        if (surah < 1 || surah > 114 || ayah < 1) return null;
        return { surah, ayah, verseKey: `${surah}:${ayah}` };
    }

    function clearHighlights() {
        text.querySelectorAll('.is-verse-selected').forEach(element => {
            element.classList.remove('is-verse-selected');
        });
    }

    function highlightVerse(verseKey) {
        clearHighlights();
        text.querySelectorAll('.mushaf-word[data-verse]').forEach(word => {
            if (word.dataset.verse !== verseKey) return;
            word.classList.add('is-verse-selected');
            const group = word.closest('.ayah-end-group');
            if (group && text.contains(group)) group.classList.add('is-verse-selected');
        });
    }

    function cancelPending() {
        if (!pending) return;
        clearTimeout(pending.timer);
        pending = null;
    }

    function isOpen() {
        return sheet.classList.contains('is-open');
    }

    function openVerseActions(verse, pointer) {
        if (isOpen()) return;
        selectedVerse = verse;
        highlightVerse(verse.verseKey);
        reference.textContent = `سورة ${toArabicDigits(verse.surah)} • الآية ${toArabicDigits(verse.ayah)}`;
        lastFocus = document.activeElement;
        clearTimeout(closeTimer);
        backdrop.hidden = false;
        sheet.setAttribute('aria-hidden', 'false');
        sheet.classList.add('is-open');
        requestAnimationFrame(() => backdrop.classList.add('is-open'));
        closeButton.focus({ preventScroll: true });

        // Clear the reader's pending swipe without turning the page.
        if (typeof PointerEvent === 'function') {
            stage.dispatchEvent(new PointerEvent('pointercancel', {
                bubbles: true, pointerId: pointer.id, pointerType: pointer.type
            }));
        }
        suppressClick = true;
        window.dispatchEvent(new CustomEvent('mushaf:verse-selected', {
            detail: { surah: verse.surah, ayah: verse.ayah, verseKey: verse.verseKey }
        }));
    }

    function closeVerseActions() {
        if (!isOpen()) return;
        sheet.classList.remove('is-open');
        sheet.setAttribute('aria-hidden', 'true');
        backdrop.classList.remove('is-open');
        selectedVerse = null;
        clearHighlights();
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => { backdrop.hidden = true; }, 240);
        if (lastFocus instanceof HTMLElement && lastFocus.isConnected) {
            lastFocus.focus({ preventScroll: true });
        }
        lastFocus = null;
    }

    // Document capture precedes both the original and mobile swipe handlers.
    document.addEventListener('pointerdown', event => {
        cancelPending();
        if (isOpen() || (event.pointerType === 'mouse' && event.button !== 0)) return;
        if (document.querySelector('.settings-sheet.is-open, .index-sheet.is-open')) return;
        const verse = verseFromTarget(event.target);
        if (!verse) return;
        const pointer = { id: event.pointerId, type: event.pointerType };
        pending = {
            ...pointer, x: event.clientX, y: event.clientY,
            timer: setTimeout(() => {
                if (!pending || pending.id !== pointer.id) return;
                pending = null;
                openVerseActions(verse, pointer);
            }, HOLD_MS)
        };
    }, true);

    document.addEventListener('pointermove', event => {
        if (!pending || pending.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > MOVE_TOLERANCE) {
            cancelPending();
        }
    }, true);

    document.addEventListener('pointerup', event => {
        if (pending?.id === event.pointerId) cancelPending();
        if (!isOpen() || !suppressClick || !stage.contains(event.target)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setTimeout(() => { suppressClick = false; }, 400);
    }, true);

    document.addEventListener('pointercancel', event => {
        if (pending?.id === event.pointerId) cancelPending();
    }, true);

    document.addEventListener('click', event => {
        if (!suppressClick) return;
        suppressClick = false;
        if (!stage.contains(event.target)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    // Avoid the native text menu competing with the custom long-press menu.
    document.addEventListener('contextmenu', event => {
        if (verseFromTarget(event.target)) event.preventDefault();
    }, true);

    closeButton.addEventListener('click', closeVerseActions);
    backdrop.addEventListener('click', closeVerseActions);
    window.addEventListener('blur', cancelPending);
    document.addEventListener('keydown', event => {
        if (!isOpen()) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeVerseActions();
        } else if (event.key === 'Tab') {
            event.preventDefault();
            closeButton.focus();
        }
    }, true);

    // Never carry a selection across page changes.
    new MutationObserver(() => {
        if (isOpen()) closeVerseActions();
        else if (selectedVerse) {
            selectedVerse = null;
            clearHighlights();
        }
    }).observe(text, { childList: true });

    // The stable surah/ayah key will be used to load tafsir later.
    window.mushafVerseActions = {
        getSelectedVerse() {
            return selectedVerse ? { ...selectedVerse } : null;
        },
        close: closeVerseActions
    };
})();
