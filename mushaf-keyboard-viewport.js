// Keep the printed mushaf geometry unchanged while Android opens its keyboard.
// This does not edit Quran text, kashida, fonts, word measurements or page data.
(() => {
    'use strict';
    const reader = document.querySelector('.reader-page');
    const stage = document.getElementById('reader-stage');
    if (!reader || !stage) return;

    let pinned = null;
    let releaseTimer = null;

    function editable(element) {
        if (!element || !reader.contains(element)) return false;
        if (element.isContentEditable) return true;
        const tag = element.tagName?.toLowerCase();
        if (tag === 'textarea') return true;
        if (tag !== 'input') return false;
        return !['button', 'checkbox', 'radio', 'range', 'file', 'submit',
            'reset', 'hidden', 'color'].includes(element.type);
    }

    function cancelRelease() {
        if (releaseTimer !== null) clearTimeout(releaseTimer);
        releaseTimer = null;
    }

    function pin() {
        cancelRelease();
        if (pinned) return;
        const rootHeight = reader.getBoundingClientRect().height;
        const stageHeight = stage.getBoundingClientRect().height;
        if (rootHeight <= 0 || stageHeight <= 0) return;
        pinned = {
            width: window.innerWidth,
            height: window.innerHeight,
            visualHeight: window.visualViewport?.height || window.innerHeight,
            originalRoot: reader.style.height,
            originalStage: stage.style.height
        };
        reader.style.height = rootHeight + 'px';
        stage.style.height = stageHeight + 'px';
        reader.dataset.keyboardViewportLocked = 'true';
    }

    function unpin() {
        if (!pinned) return;
        const old = pinned;
        pinned = null;
        cancelRelease();
        reader.style.height = old.originalRoot;
        stage.style.height = old.originalStage;
        delete reader.dataset.keyboardViewportLocked;
    }

    function restored() {
        if (!pinned) return true;
        const visualHeight = window.visualViewport?.height || window.innerHeight;
        return window.innerHeight >= pinned.height - 12 &&
            visualHeight >= pinned.visualHeight - 12;
    }

    function scheduleRelease() {
        cancelRelease();
        // focusout happens before the keyboard's closing animation is done.
        // Releasing at that moment would make 100dvh narrow the Quran rows.
        let attempts = 0;
        function check() {
            if (!pinned || editable(document.activeElement)) return;
            if (restored() || ++attempts >= 40) {
                unpin();
                return;
            }
            releaseTimer = setTimeout(check, 90);
        }
        releaseTimer = setTimeout(check, 180);
    }

    document.addEventListener('focusin', event => {
        if (editable(event.target)) pin();
    }, true);
    document.addEventListener('focusout', event => {
        if (editable(event.target)) scheduleRelease();
    }, true);

    function onViewportChange() {
        if (!pinned) return;
        // A device rotation is a genuine layout change, unlike a keyboard.
        if (Math.abs(window.innerWidth - pinned.width) > 20) {
            unpin();
            return;
        }
        if (!editable(document.activeElement) && restored()) unpin();
    }
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.visualViewport?.addEventListener('resize', onViewportChange, { passive: true });
    window.addEventListener('orientationchange', unpin, { passive: true });

    window.mushafKeyboardViewport = Object.freeze({
        isLocked: () => !!pinned,
        height: () => pinned?.height || null
    });
})();
