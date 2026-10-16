(() => {
    'use strict';

    const TOTAL_PAGES = 604;
    const FORWARD_LOOKAHEAD = 10;
    const BACKWARD_LOOKAHEAD = 4;
    const START_DELAY_MS = 850;
    const RESUME_DELAY_MS = 420;
    const SUFFIX_MARKS = new Set(['ۖ', 'ۚ', 'ۘ', 'ۗ', 'ۛ', 'ۙ', 'ۜ', '۩']);
    const PREFIX_MARKS = new Set(['۞']);

    const stage = document.getElementById('reader-stage');
    const page = document.getElementById('mushaf-page');
    const text = document.getElementById('quran-text');
    if (!stage || !page || !text) return;

    let tokens = [];
    let ready = false;
    let interacting = false;
    let idleHandle = null;
    let resumeTimer = null;
    let queueRevision = 0;
    let pendingPages = [];

    const diagnostics = window.mushafLayoutCacheDiagnostics || {};
    diagnostics.backgroundPrepared = diagnostics.backgroundPrepared || 0;
    diagnostics.backgroundSkipped = diagnostics.backgroundSkipped || 0;
    diagnostics.backgroundLastMs = diagnostics.backgroundLastMs || 0;
    diagnostics.backgroundQueue = 0;
    diagnostics.backgroundCurrentPage = 0;

    function splitQuranWords(value) {
        const words = [];
        let prefix = '';
        for (const rawWord of value.split(/\s+/).filter(Boolean)) {
            if (PREFIX_MARKS.has(rawWord)) {
                prefix += rawWord;
            } else if (SUFFIX_MARKS.has(rawWord) && words.length) {
                words[words.length - 1] += `\u202f${rawWord}`;
            } else {
                words.push(prefix ? `${prefix}\u202f${rawWord}` : rawWord);
                prefix = '';
            }
        }
        return words;
    }

    function buildTokens(verses) {
        const result = [];
        for (const verse of verses) {
            const words = splitQuranWords(verse.text);
            words.forEach((wordText, word) => result.push({
                text: wordText,
                surah: verse.surah,
                ayah: verse.ayah,
                word,
                isAyahEnd: word === words.length - 1
            }));
        }
        return result;
    }

    function toArabicDigits(value) {
        return String(value).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit]);
    }

    function getCurrentPage() {
        const current = Number(window.mushafReader?.getCurrentPage?.());
        return Number.isInteger(current) ? Math.max(1, Math.min(TOTAL_PAGES, current)) : 1;
    }

    function createWord(token) {
        const word = document.createElement('span');
        word.className = 'mushaf-word';
        word.dataset.verse = `${token.surah}:${token.ayah}`;
        word.dataset.word = String(token.word);
        word.textContent = token.text;
        return word;
    }

    function createMarker(token, template) {
        if (template) {
            const marker = template.cloneNode(true);
            marker.dataset.digits = String(token.ayah).length;
            marker.setAttribute('aria-label', `الآية ${token.ayah}`);
            const number = marker.querySelector('.ayah-number');
            if (number) number.textContent = toArabicDigits(token.ayah);
            return marker;
        }
        const marker = document.createElement('span');
        marker.className = 'ayah-marker';
        marker.dataset.digits = String(token.ayah).length;
        const number = document.createElement('span');
        number.className = 'ayah-number';
        number.textContent = toArabicDigits(token.ayah);
        marker.appendChild(number);
        return marker;
    }

    function createHeading(surah, template) {
        if (template) {
            const heading = template.cloneNode(true);
            heading.dataset.surah = String(surah);
            return heading;
        }
        const heading = document.createElement('header');
        heading.className = 'surah-heading';
        heading.dataset.surah = String(surah);
        const title = document.createElement('h2');
        title.className = 'surah-name';
        title.textContent = 'سورة';
        heading.appendChild(title);
        return heading;
    }

    function buildProbeText(container, layout) {
        const markerTemplate = text.querySelector('.ayah-marker');
        const headingTemplate = text.querySelector('.surah-heading');
        const fragment = document.createDocumentFragment();

        for (const row of layout) {
            if (row[0] === 'h') {
                fragment.appendChild(createHeading(row[1], headingTemplate));
                continue;
            }
            if (row[0] === 'b') {
                const basmala = document.createElement('div');
                basmala.className = 'surah-basmala';
                for (let index = row[1]; index < row[2]; index++) {
                    basmala.appendChild(createWord(tokens[index]));
                }
                fragment.appendChild(basmala);
                continue;
            }

            const line = document.createElement('div');
            line.className = 'mushaf-line is-short-line';
            line.dataset.start = String(row[1]);
            line.dataset.end = String(row[2]);
            for (let index = row[1]; index < row[2]; index++) {
                const token = tokens[index];
                const word = createWord(token);
                if (token.isAyahEnd) {
                    const group = document.createElement('span');
                    group.className = 'ayah-end-group';
                    group.append(word, createMarker(token, markerTemplate));
                    line.appendChild(group);
                } else {
                    line.appendChild(word);
                }
            }
            fragment.appendChild(line);
        }

        delete container.dataset.standardLayoutPage;
        delete container.dataset.standardLayoutWidth;
        container.dataset.layoutState = 'pending';
        container.replaceChildren(fragment);
        container.style.setProperty('--mushaf-line-count', layout.length);
        const headingCount = layout.filter(row => row[0] === 'h').length;
        container.classList.toggle('multi-surah-page', headingCount >= 2);
        container.classList.toggle('dense-surah-page', headingCount >= 3);
    }

    function buildPriorityQueue(current) {
        const result = [];
        const seen = new Set([1, 2]);
        const add = pageNumber => {
            if (!Number.isInteger(pageNumber) || pageNumber < 3 || pageNumber > TOTAL_PAGES || seen.has(pageNumber)) return;
            seen.add(pageNumber);
            result.push(pageNumber);
        };

        // The likely reading direction gets ten pages of headroom first.
        for (let offset = 1; offset <= FORWARD_LOOKAHEAD; offset++) add(current + offset);
        for (let offset = 1; offset <= BACKWARD_LOOKAHEAD; offset++) add(current - offset);
        add(current);

        // Once the nearby pages are safe, keep walking forward to page 604.
        for (let pageNumber = current + FORWARD_LOOKAHEAD + 1; pageNumber <= TOTAL_PAGES; pageNumber++) {
            add(pageNumber);
        }
        // Then fill any older pages that are still missing.
        for (let pageNumber = 3; pageNumber < current - BACKWARD_LOOKAHEAD; pageNumber++) add(pageNumber);
        return result;
    }

    function clearIdle() {
        if (idleHandle === null) return;
        if ('cancelIdleCallback' in window) cancelIdleCallback(idleHandle);
        else clearTimeout(idleHandle);
        idleHandle = null;
    }

    function clearResumeTimer() {
        if (resumeTimer === null) return;
        clearTimeout(resumeTimer);
        resumeTimer = null;
    }

    function cacheHas(pageNumber) {
        const cache = window.mushafLayoutCache;
        if (!cache?.has) return false;
        return cache.has(pageNumber, text.clientWidth, text.clientHeight);
    }

    function preparePage(pageNumber) {
        const reader = window.mushafReader;
        const layout = reader?.getPageLayout?.(pageNumber);
        if (!layout || !tokens.length || !reader?.fitElement) return false;

        const stageRect = stage.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        const probe = page.cloneNode(true);
        probe.removeAttribute('id');
        probe.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
        probe.classList.remove('swipe-preview', 'is-front');
        probe.classList.add('layout-cache-probe');
        probe.setAttribute('aria-hidden', 'true');
        Object.assign(probe.style, {
            position: 'absolute',
            left: `${pageRect.left - stageRect.left}px`,
            top: `${pageRect.top - stageRect.top}px`,
            width: `${pageRect.width}px`,
            height: `${pageRect.height}px`,
            visibility: 'hidden',
            pointerEvents: 'none',
            transform: 'none',
            transition: 'none',
            opacity: '0',
            zIndex: '-1'
        });

        const probeText = probe.querySelector('.quran-text');
        if (!probeText) return false;
        probeText.style.cssText = text.style.cssText;
        buildProbeText(probeText, layout);
        stage.appendChild(probe);
        try {
            reader.fitElement(probeText, pageNumber);
            return probeText.dataset.layoutState === 'ready';
        } finally {
            probe.remove();
        }
    }

    function scheduleIdle(revision) {
        if (!ready || interacting || document.hidden || revision !== queueRevision || idleHandle !== null) return;

        const run = deadline => {
            idleHandle = null;
            if (!ready || interacting || document.hidden || revision !== queueRevision) return;
            if (!deadline.didTimeout && deadline.timeRemaining() < 7) {
                scheduleIdle(revision);
                return;
            }

            let target = null;
            while (pendingPages.length) {
                const candidate = pendingPages.shift();
                if (cacheHas(candidate)) {
                    diagnostics.backgroundSkipped++;
                    continue;
                }
                target = candidate;
                break;
            }
            diagnostics.backgroundQueue = pendingPages.length;
            if (!target) return;

            const started = performance.now();
            const prepared = preparePage(target);
            diagnostics.backgroundLastMs = Math.round((performance.now() - started) * 10) / 10;
            if (prepared) diagnostics.backgroundPrepared++;

            if (pendingPages.length) scheduleIdle(revision);
        };

        if ('requestIdleCallback' in window) {
            idleHandle = requestIdleCallback(run, { timeout: 3000 });
        } else {
            idleHandle = setTimeout(() => run({ didTimeout: true, timeRemaining: () => 0 }), 140);
        }
    }

    function rebuildQueue(delay = START_DELAY_MS) {
        clearIdle();
        clearResumeTimer();
        queueRevision++;
        const revision = queueRevision;
        resumeTimer = setTimeout(() => {
            resumeTimer = null;
            if (!ready || interacting || document.hidden || revision !== queueRevision) return;
            const current = getCurrentPage();
            diagnostics.backgroundCurrentPage = current;
            pendingPages = buildPriorityQueue(current);
            diagnostics.backgroundQueue = pendingPages.length;
            scheduleIdle(revision);
        }, delay);
    }

    async function initialize() {
        const reader = window.mushafReader;
        const verses = reader?.getSearchVerses?.();
        if (!Array.isArray(verses) || !verses.length) return;
        tokens = buildTokens(verses);
        if (!tokens.length) return;
        try {
            await window.mushafLayoutCache?.ready;
        } catch (_) {
            // Memory cache still works if IndexedDB initialization failed.
        }
        ready = true;
        rebuildQueue();
    }

    stage.addEventListener('pointerdown', () => {
        interacting = true;
        clearIdle();
        clearResumeTimer();
    }, { capture: true, passive: true });

    const resumeAfterInteraction = () => {
        interacting = false;
        rebuildQueue(RESUME_DELAY_MS);
    };
    stage.addEventListener('pointerup', resumeAfterInteraction, { capture: true, passive: true });
    stage.addEventListener('pointercancel', resumeAfterInteraction, { capture: true, passive: true });

    window.addEventListener('mushaf:page-ready', () => rebuildQueue(START_DELAY_MS));
    window.addEventListener('resize', () => rebuildQueue(START_DELAY_MS), { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearIdle();
            clearResumeTimer();
        } else {
            rebuildQueue(START_DELAY_MS);
        }
    });

    if (window.mushafReader?.getSearchVerses?.()?.length) initialize();
    else window.addEventListener('mushaf:data-ready', initialize, { once: true });
})();
