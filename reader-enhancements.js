(() => {
    'use strict';

    const DATA_URL = './data/quran-uthmani.txt';
    const LAYOUT_URL = './data/mushaf-layout.json';
    const TOTAL_PAGES = 604;
    const JUZ_START_PAGES = [1,22,42,62,82,102,121,142,162,182,201,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582];
    const SUFFIX_MARKS = new Set(['ۖ', 'ۚ', 'ۘ', 'ۗ', 'ۛ', 'ۙ', 'ۜ', '۩']);
    const PREFIX_MARKS = new Set(['۞']);
    const SURAH_NAMES = [
        'الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس',
        'هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه','الأنبياء','الحج',
        'المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم','لقمان','السجدة','الأحزاب',
        'سبأ','فاطر','يس','الصافات','ص','الزمر','غافر','فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف',
        'محمد','الفتح','الحجرات','ق','الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة',
        'الحشر','الممتحنة','الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة',
        'المعارج','نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس',
        'التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر','البلد','الشمس',
        'الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة','العاديات','القارعة','التكاثر','العصر',
        'الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون','النصر','المسد','الإخلاص','الفلق','الناس'
    ];

    const stage = document.getElementById('reader-stage');
    const page = document.getElementById('mushaf-page');
    const text = document.getElementById('quran-text');
    const pageRange = document.getElementById('page-range');
    const toolbarSurah = document.getElementById('toolbar-surah');
    const toolbarRange = document.getElementById('toolbar-range');
    const displayPageNumber = document.getElementById('display-page-number');
    if (!stage || !page || !text || !displayPageNumber) return;

    let previewPages = null;
    let previewTokens = null;
    let previewReady = false;
    let gesture = null;
    let preview = null;
    let headingTemplate = null;
    let markerTemplate = null;
    let metaQueued = false;
    let suppressSwipeClick = false;
    let previewPreparationHandle = null;
    let previewPreparationRevision = 0;
    const preparedPreviews = new Map();
    const swipeDiagnostics = {
        preparedBuilds: 0,
        preparedHits: 0,
        preparationMisses: 0,
        preparedReady: 0,
    };
    window.mushafSwipeDiagnostics = swipeDiagnostics;

    function syncPreparedDiagnostics() {
        swipeDiagnostics.preparedReady = preparedPreviews.size;
        swipeDiagnostics.preparedKeys = Array.from(preparedPreviews.keys());
    }

    preload()
        .then(schedulePreviewPreparation)
        .catch(error => console.warn('Swipe preview data unavailable:', error));

    async function preload() {
        const [quranResponse, layoutResponse] = await Promise.all([fetch(DATA_URL), fetch(LAYOUT_URL)]);
        if (!quranResponse.ok || !layoutResponse.ok) return;
        previewTokens = buildTokens(parseQuran(await quranResponse.text()));
        const layout = await layoutResponse.json();
        if (!Array.isArray(layout?.pages) || layout.pages.length !== TOTAL_PAGES) return;
        previewPages = layout.pages;
        previewReady = true;
    }

    function parseQuran(raw) {
        const result = [];
        for (const line of raw.split(/\r?\n/)) {
            if (!line || line.startsWith('#')) continue;
            const first = line.indexOf('|');
            const second = line.indexOf('|', first + 1);
            if (first < 1 || second < 0) continue;
            const surah = Number(line.slice(0, first));
            const ayah = Number(line.slice(first + 1, second));
            const value = line.slice(second + 1).trim();
            if (Number.isInteger(surah) && Number.isInteger(ayah) && value) result.push({ surah, ayah, text: value });
        }
        return result;
    }

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

    function fromArabicDigits(value) {
        const digits = '٠١٢٣٤٥٦٧٨٩';
        return Number(String(value).replace(/[٠-٩]/g, digit => String(digits.indexOf(digit))).replace(/[^0-9]/g, '')) || 1;
    }

    function toArabicDigits(value) {
        return String(value).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit]);
    }

    function getCurrentPage() {
        const readerPage = Number(window.mushafReader?.getCurrentPage?.());
        if (Number.isInteger(readerPage)) return Math.max(1, Math.min(TOTAL_PAGES, readerPage));
        return Math.max(1, Math.min(TOTAL_PAGES, fromArabicDigits(displayPageNumber.textContent)));
    }

    function getJuz(pageNumber) {
        let juz = 1;
        JUZ_START_PAGES.forEach((start, index) => {
            if (pageNumber >= start) juz = index + 1;
        });
        return juz;
    }

    function pageSurahs(root = text) {
        const seen = new Set();
        root.querySelectorAll('.mushaf-word[data-verse]').forEach(word => {
            const surah = Number(word.dataset.verse?.split(':')[0]);
            if (Number.isInteger(surah) && surah >= 1 && surah <= 114) seen.add(surah);
        });
        root.querySelectorAll('.surah-heading[data-surah]').forEach(header => {
            const surah = Number(header.dataset.surah);
            if (Number.isInteger(surah) && surah >= 1 && surah <= 114) seen.add(surah);
        });
        return Array.from(seen).sort((a, b) => a - b);
    }

    function syncMeta() {
        metaQueued = false;
        const headers = text.querySelectorAll('.surah-heading');
        text.classList.toggle('multi-surah-page', headers.length >= 2);
        text.classList.toggle('dense-surah-page', headers.length >= 3);
        if (headers[0]) headingTemplate = headers[0].cloneNode(true);
        const marker = text.querySelector('.ayah-marker');
        if (marker) markerTemplate = marker.cloneNode(true);

        const current = getCurrentPage();
        const surahs = pageSurahs();
        if (toolbarSurah && surahs.length) {
            toolbarSurah.textContent = surahs.length === 1
                ? `سورة ${SURAH_NAMES[surahs[0] - 1]}`
                : surahs.map(number => SURAH_NAMES[number - 1]).join('، ');
        }
        const juzText = `الجزء ${toArabicDigits(getJuz(current))}`;
        if (toolbarRange) toolbarRange.textContent = juzText;
        if (pageRange) pageRange.textContent = juzText;
    }

    function queueMetaSync() {
        if (metaQueued) return;
        metaQueued = true;
        requestAnimationFrame(syncMeta);
    }

    new MutationObserver(queueMetaSync).observe(text, { childList: true, subtree: false });
    queueMetaSync();

    function previewHeading(surah) {
        if (headingTemplate) {
            const heading = headingTemplate.cloneNode(true);
            heading.dataset.surah = String(surah);
            const chapter = heading.querySelector('.surah-title-chapter');
            if (chapter) {
                // Preserve the main reader's aligned title spans during swipe previews.
                // Replacing .surah-name.textContent destroys them and makes the title jump on commit.
                chapter.textContent = SURAH_NAMES[surah - 1];
            } else {
                const title = heading.querySelector('.surah-name');
                if (title) title.textContent = `سورة ${SURAH_NAMES[surah - 1]}`;
            }
            return heading;
        }
        const heading = document.createElement('header');
        heading.className = 'surah-heading preview-heading-fallback';
        heading.dataset.surah = String(surah);
        const title = document.createElement('h2');
        title.className = 'surah-name';
        const titleLine = document.createElement('span');
        titleLine.className = 'surah-title-line';
        const prefix = document.createElement('span');
        prefix.className = 'surah-title-prefix';
        prefix.textContent = 'سورة';
        const chapter = document.createElement('span');
        chapter.className = 'surah-title-chapter';
        chapter.textContent = SURAH_NAMES[surah - 1];
        titleLine.append(prefix, document.createTextNode(' '), chapter);
        title.appendChild(titleLine);
        heading.appendChild(title);
        return heading;
    }

    function previewMarker(ayah) {
        if (markerTemplate) {
            const marker = markerTemplate.cloneNode(true);
            marker.setAttribute('aria-label', `الآية ${ayah}`);
            marker.dataset.digits = String(ayah).length;
            const number = marker.querySelector('.ayah-number');
            if (number) number.textContent = toArabicDigits(ayah);
            return marker;
        }
        const marker = document.createElement('span');
        marker.className = 'ayah-marker preview-marker-fallback';
        marker.textContent = toArabicDigits(ayah);
        return marker;
    }

    function previewWord(token) {
        const word = document.createElement('span');
        word.className = 'mushaf-word';
        word.dataset.verse = `${token.surah}:${token.ayah}`;
        word.dataset.word = String(token.word);
        word.textContent = token.text;
        return word;
    }

    function buildPreviewText(container, layout) {
        delete container.dataset.standardLayoutPage;
        delete container.dataset.standardLayoutWidth;
        const fragment = document.createDocumentFragment();
        for (const row of layout) {
            if (row[0] === 'h') {
                fragment.appendChild(previewHeading(row[1]));
                continue;
            }
            if (row[0] === 'b') {
                const basmala = document.createElement('div');
                basmala.className = 'surah-basmala';
                for (let index = row[1]; index < row[2]; index++) basmala.appendChild(previewWord(previewTokens[index]));
                fragment.appendChild(basmala);
                continue;
            }
            const line = document.createElement('div');
            line.className = 'mushaf-line is-short-line';
            line.dataset.start = String(row[1]);
            line.dataset.end = String(row[2]);
            for (let index = row[1]; index < row[2]; index++) {
                const token = previewTokens[index];
                const word = previewWord(token);
                if (token.isAyahEnd) {
                    const group = document.createElement('span');
                    group.className = 'ayah-end-group';
                    group.append(word, previewMarker(token.ayah));
                    line.appendChild(group);
                } else {
                    line.appendChild(word);
                }
            }
            if (line.children.length >= 4) line.className = 'mushaf-line is-full-line';
            fragment.appendChild(line);
        }
        container.replaceChildren(fragment);
        container.style.setProperty('--mushaf-line-count', layout.length);
        const headingCount = layout.filter(row => row[0] === 'h').length;
        container.classList.toggle('multi-surah-page', headingCount >= 2);
        container.classList.toggle('dense-surah-page', headingCount >= 3);
    }

    function createPreview(targetPage, direction) {
        const layout = window.mushafReader?.getPageLayout?.(targetPage) ||
            previewPages?.[targetPage - 1];
        if (!layout) return null;

        const stageRect = stage.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        const clone = page.cloneNode(true);
        clone.id = '';
        clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
        clone.setAttribute('aria-hidden', 'true');
        clone.classList.add('swipe-preview');
        clone.style.width = `${pageRect.width}px`;
        clone.style.height = `${pageRect.height}px`;
        clone.style.left = `${pageRect.left - stageRect.left}px`;
        clone.style.top = `${pageRect.top - stageRect.top}px`;

        const cloneText = clone.querySelector('.quran-text');
        cloneText.style.cssText = text.style.cssText;
        cloneText.dataset.preparedPage = String(targetPage);
        buildPreviewText(cloneText, layout);

        const surahs = pageSurahs(cloneText);
        const pageSurah = clone.querySelector('.page-heading span:first-child');
        const pageJuz = clone.querySelector('.page-heading span:last-child');
        const foot = clone.querySelector('.display-page-number');
        if (pageSurah && surahs.length) {
            pageSurah.textContent = surahs.length === 1
                ? `سورة ${SURAH_NAMES[surahs[0] - 1]}`
                : surahs.map(number => SURAH_NAMES[number - 1]).join('، ');
        }
        if (pageJuz) pageJuz.textContent = `الجزء ${toArabicDigits(getJuz(targetPage))}`;
        if (foot) foot.textContent = toArabicDigits(targetPage);

        clone.dataset.direction = String(direction);
        clone.style.transform = `translateX(${-direction * pageRect.width}px)`;
        stage.appendChild(clone);
        // The target is fitted while offscreen, before the drag reveals it.
        window.mushafReader?.fitElement(cloneText, targetPage);
        return clone;
    }

    function previewKey(targetPage, direction) {
        return `${targetPage}:${direction}`;
    }

    function clearPreparedPreviews() {
        preparedPreviews.forEach(node => node.remove());
        preparedPreviews.clear();
        syncPreparedDiagnostics();
    }

    function cancelPreviewPreparation(clearPrepared = true) {
        previewPreparationRevision++;
        if (previewPreparationHandle !== null) {
            if ('cancelIdleCallback' in window) cancelIdleCallback(previewPreparationHandle);
            else clearTimeout(previewPreparationHandle);
            previewPreparationHandle = null;
        }
        if (clearPrepared) clearPreparedPreviews();
    }

    function scheduleIdle(callback) {
        if ('requestIdleCallback' in window) {
            previewPreparationHandle = requestIdleCallback(callback, { timeout: 450 });
        } else {
            previewPreparationHandle = setTimeout(
                () => callback({ timeRemaining: () => 8 }), 60,
            );
        }
    }

    function schedulePreviewPreparation() {
        cancelPreviewPreparation(false);
        if (!previewReady || gesture || preview) return;

        const revision = previewPreparationRevision;
        const current = getCurrentPage();
        // The next page is the common reading direction, so prepare it first.
        const candidates = [1, -1]
            .map(direction => ({ direction, target: current + direction }))
            .filter(item => item.target >= 1 && item.target <= TOTAL_PAGES);
        const desiredKeys = new Set(candidates.map(item => (
            previewKey(item.target, item.direction)
        )));
        preparedPreviews.forEach((node, key) => {
            if (desiredKeys.has(key)) return;
            node.remove();
            preparedPreviews.delete(key);
        });
        const missing = candidates.filter(item => !preparedPreviews.has(
            previewKey(item.target, item.direction),
        ));
        syncPreparedDiagnostics();

        const prepareNext = deadline => {
            previewPreparationHandle = null;
            if (revision !== previewPreparationRevision || gesture || preview) return;
            const item = missing.shift();
            if (!item) return;

            const node = createPreview(item.target, item.direction);
            if (revision !== previewPreparationRevision || !node) {
                node?.remove();
                return;
            }
            node.remove();
            node.dataset.preparedPreview = 'true';
            preparedPreviews.set(previewKey(item.target, item.direction), node);
            swipeDiagnostics.preparedBuilds++;
            syncPreparedDiagnostics();

            if (missing.length) scheduleIdle(prepareNext);
        };
        if (missing.length) scheduleIdle(prepareNext);
    }

    function scheduleLookaheadPreparation(targetPage, direction) {
        if (targetPage < 1 || targetPage > TOTAL_PAGES) return;
        const key = previewKey(targetPage, direction);
        if (preparedPreviews.has(key)) return;
        const revision = previewPreparationRevision;
        setTimeout(() => {
            if (revision !== previewPreparationRevision || gesture || preparedPreviews.has(key)) return;
            const node = createPreview(targetPage, direction);
            if (revision !== previewPreparationRevision || !node) {
                node?.remove();
                return;
            }
            node.remove();
            node.dataset.preparedPreview = 'true';
            preparedPreviews.set(key, node);
            swipeDiagnostics.preparedBuilds++;
            syncPreparedDiagnostics();
        }, 0);
    }

    function buildPreview(targetPage, direction) {
        removePreview();
        const key = previewKey(targetPage, direction);
        const prepared = preparedPreviews.get(key);
        if (prepared) {
            preparedPreviews.delete(key);
            prepared.dataset.preparedPreview = 'used';
            stage.appendChild(prepared);
            preview = prepared;
            swipeDiagnostics.preparedHits++;
            syncPreparedDiagnostics();
            return preview;
        }

        // Never construct and fit a page from pointermove. A preparation miss
        // still lets the current page follow the finger; pointerup commits the
        // turn without stalling the gesture on hundreds of layout reads.
        swipeDiagnostics.preparationMisses++;
        return null;
    }

    function removePreview() {
        preview?.remove();
        preview = null;
    }

    function resetSwipe(animate = true) {
        if (!preview) {
            page.style.transform = '';
            page.style.transition = '';
            return;
        }
        const direction = Number(preview.dataset.direction) || 1;
        const width = page.getBoundingClientRect().width;
        if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            page.style.transform = '';
            page.style.transition = '';
            removePreview();
            return;
        }
        page.style.transition = 'transform 180ms ease-out';
        preview.style.transition = 'transform 180ms ease-out';
        page.style.transform = 'translateX(0)';
        preview.style.transform = `translateX(${-direction * width}px)`;
        setTimeout(() => {
            page.style.transition = '';
            page.style.transform = '';
            removePreview();
            schedulePreviewPreparation();
        }, 190);
    }

    function finishSwipe(direction, targetPage) {
        const width = page.getBoundingClientRect().width;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!preview || reduced) {
            const preparedText = preview?.querySelector('.quran-text') || null;
            dispatchPageTurn(direction, preparedText);
            removePreview();
            schedulePreviewPreparation();
            return;
        }
        page.style.transition = 'transform 175ms ease-out';
        preview.style.transition = 'transform 175ms ease-out';
        page.style.transform = `translateX(${direction * width}px)`;
        preview.style.transform = 'translateX(0)';
        preview.classList.add('is-front');
        scheduleLookaheadPreparation(targetPage + direction, direction);
        setTimeout(() => {
            page.style.transition = '';
            page.style.transform = '';
            dispatchPageTurn(direction, preview?.querySelector('.quran-text') || null);
            requestAnimationFrame(() => {
                removePreview();
                queueMetaSync();
                schedulePreviewPreparation();
            });
        }, 180);
    }

    function dispatchPageTurn(direction, preparedText = null) {
        if (window.mushafReader?.turnPageInstant(direction, preparedText)) return;
        window.dispatchEvent(new KeyboardEvent('keydown', {
            key: direction > 0 ? 'ArrowLeft' : 'ArrowRight',
            bubbles: true
        }));
    }

    stage.addEventListener('pointerdown', event => {
        // Keep the original desktop mouse animation in app.js; use the enhanced preview only for touch/pen.
        if (!previewReady || !['touch', 'pen'].includes(event.pointerType)) return;
        if (event.target.closest('button, a, input, [role="button"]')) return;
        if (document.querySelector('.settings-sheet.is-open, .index-sheet.is-open')) return;
        gesture = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            dx: 0,
            dragging: false,
            direction: 0,
            targetPage: 0,
            currentPage: getCurrentPage(),
            pageWidth: page.clientWidth,
        };
        event.stopImmediatePropagation();
    }, true);

    stage.addEventListener('pointermove', event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        if (!gesture.dragging) {
            if (Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) {
                gesture = null;
                return;
            }
            if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
            gesture.dragging = true;
            suppressSwipeClick = true;
            stage.setPointerCapture?.(event.pointerId);
        }
        event.stopImmediatePropagation();
        if (event.cancelable) event.preventDefault();

        const direction = dx > 0 ? 1 : -1;
        const target = gesture.currentPage + direction;
        const canTurn = target >= 1 && target <= TOTAL_PAGES;
        const effectiveDx = canTurn ? dx : dx * 0.16;

        if (canTurn && (!preview || gesture.direction !== direction)) {
            buildPreview(target, direction);
            gesture.direction = direction;
            gesture.targetPage = target;
        } else if (!canTurn) {
            removePreview();
            gesture.direction = direction;
            gesture.targetPage = 0;
        }

        gesture.dx = effectiveDx;
        page.style.transition = 'none';
        page.style.transform = `translateX(${effectiveDx}px)`;
        if (preview) {
            preview.style.transition = 'none';
            preview.style.transform = `translateX(${effectiveDx - direction * gesture.pageWidth}px)`;
        }
    }, { capture: true, passive: false });

    stage.addEventListener('pointerup', event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        event.stopImmediatePropagation();
        const currentGesture = gesture;
        gesture = null;
        if (!currentGesture.dragging) return;
        const threshold = Math.min(84, page.clientWidth * 0.2);
        if (!currentGesture.targetPage || Math.abs(currentGesture.dx) < threshold) {
            resetSwipe(true);
            return;
        }
        finishSwipe(currentGesture.direction, currentGesture.targetPage);
    }, true);

    stage.addEventListener('pointercancel', event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        event.stopImmediatePropagation();
        gesture = null;
        resetSwipe(true);
    }, true);

    // Suppress the click generated after a drag (which otherwise toggles the toolbar).
    stage.addEventListener('click', event => {
        if (!suppressSwipeClick) return;
        suppressSwipeClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    window.addEventListener('mushaf:page-ready', schedulePreviewPreparation);
    window.addEventListener('resize', () => {
        cancelPreviewPreparation(true);
        setTimeout(schedulePreviewPreparation, 140);
    }, { passive: true });
})();
