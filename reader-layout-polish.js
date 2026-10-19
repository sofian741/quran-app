(() => {
    'use strict';

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
    const JUZ_START_PAGES = [1,22,42,62,82,102,121,142,162,182,201,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582];

    const text = document.getElementById('quran-text');
    const stage = document.getElementById('reader-stage');
    const pageSurah = document.getElementById('page-surah');
    const pageRange = document.getElementById('page-range');
    const toolbarSurah = document.getElementById('toolbar-surah');
    const toolbarRange = document.getElementById('toolbar-range');
    const displayPageNumber = document.getElementById('display-page-number');
    if (!text || !stage || !displayPageNumber) return;

    function toArabicDigits(value) {
        return String(value).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit]);
    }

    function fromArabicDigits(value) {
        const digits = '٠١٢٣٤٥٦٧٨٩';
        const number = String(value).replace(/[٠-٩]/g, digit => String(digits.indexOf(digit))).replace(/[^0-9]/g, '');
        return Number(number) || 1;
    }

    function getJuz(pageNumber) {
        let juz = 1;
        JUZ_START_PAGES.forEach((start, index) => {
            if (pageNumber >= start) juz = index + 1;
        });
        return juz;
    }

    function pageSurahs(root) {
        const seen = new Set();
        root.querySelectorAll('.mushaf-word[data-verse]').forEach(word => {
            const surah = Number(word.dataset.verse?.split(':')[0]);
            if (Number.isInteger(surah) && surah >= 1 && surah <= 114) seen.add(surah);
        });
        root.querySelectorAll('.surah-heading[data-surah]').forEach(heading => {
            const surah = Number(heading.dataset.surah);
            if (Number.isInteger(surah) && surah >= 1 && surah <= 114) seen.add(surah);
        });
        return Array.from(seen).sort((a, b) => a - b);
    }

    function applyAdaptiveRows(container) {
        // The reader uses a flex column with fixed-ratio headings. Remove stale
        // grid tracks from earlier builds so dense pages use the same layout path.
        container.style.removeProperty('grid-template-rows');
    }

    const STANDARD_FONT_WIDTH_RATIO = 0.067;
    const STANDARD_FONT_MIN = 16;
    const STANDARD_FONT_MAX = 24;
    // Increase actual Quran glyph size on phones; tablets retain responsive growth.
    const TABLET_FONT_START_WIDTH = 480;
    const TABLET_FONT_GROWTH_PER_PX = 0.075;
    const TABLET_FONT_MAX = 38;
    const TABLET_FONT_HEIGHT_ROWS = 16;
    const TABLET_FONT_HEIGHT_LINE_RATIO = 1.65;
    const TABLET_FONT_HEIGHT_BUDGET = 0.86;
    // Three verse ornaments can make a legitimate fixed-layout row wider than
    // a 320px phone even at the normal bounded gap. Keep the fallback rare,
    // but allow enough compression to prevent Quran words being clipped.
    const STANDARD_LINE_MIN_SCALE = 0.64;
    const STANDARD_GAP_MIN_EM = 0.12;
    const STANDARD_GAP_MAX_EM = 0.30;
    const STANDARD_TARGET_FILL = 0.997;
    const MAX_KASHIDAS_PER_WORD = 4;
    const MAX_KASHIDAS_PER_LINE = 32;
    const KASHIDA = '\u0640';
    const NON_JOINING_AFTER = new Set(['ء','ا','أ','إ','آ','ٱ','د','ذ','ر','ز','و','ؤ','ة']);
    const originalWordText = new WeakMap();
    const graphemeSegmenter = typeof Intl?.Segmenter === 'function'
        ? new Intl.Segmenter('ar', { granularity: 'grapheme' })
        : null;

    // Persistent layout cache. A version bump intentionally invalidates old
    // measurements whenever the line-fitting algorithm changes.
    const LAYOUT_CACHE_VERSION = 'standard-larger-type-v8-20261019';
    const LAYOUT_CACHE_DB = 'quranMushafLayoutCache';
    const LAYOUT_CACHE_STORE = 'layouts';
    const layoutMemoryCache = new Map();
    let layoutCacheDb = null;
    const layoutCacheDiagnostics = {
        version: LAYOUT_CACHE_VERSION,
        hydrated: false,
        available: 'indexedDB' in window,
        cached: 0,
        hits: 0,
        misses: 0,
        calculations: 0,
        writes: 0,
        invalid: 0,
        backgroundPrepared: 0,
        backgroundSkipped: 0,
        backgroundLastMs: 0
    };
    window.mushafLayoutCacheDiagnostics = layoutCacheDiagnostics;

    function layoutProfile(width, height) {
        return `${Math.round(width)}x${Math.round(height)}`;
    }

    function layoutCacheKey(pageNumber, width, height) {
        return `${LAYOUT_CACHE_VERSION}:${pageNumber}:${layoutProfile(width, height)}`;
    }

    function openLayoutCacheDb() {
        if (!('indexedDB' in window)) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(LAYOUT_CACHE_DB, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(LAYOUT_CACHE_STORE)) {
                    db.createObjectStore(LAYOUT_CACHE_STORE, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        });
    }

    function getAllCachedLayouts(db) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(LAYOUT_CACHE_STORE, 'readonly');
            const request = transaction.objectStore(LAYOUT_CACHE_STORE).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
        });
    }

    function deleteCachedLayouts(db, keys) {
        if (!keys.length) return;
        try {
            const transaction = db.transaction(LAYOUT_CACHE_STORE, 'readwrite');
            const store = transaction.objectStore(LAYOUT_CACHE_STORE);
            keys.forEach(key => store.delete(key));
        } catch (_) {
            // Cache cleanup must never affect Quran rendering.
        }
    }

    async function hydrateLayoutCache() {
        try {
            layoutCacheDb = await openLayoutCacheDb();
            if (!layoutCacheDb) return;
            const records = await getAllCachedLayouts(layoutCacheDb);
            const obsolete = [];
            records.forEach(record => {
                if (record?.version === LAYOUT_CACHE_VERSION && record?.key) {
                    layoutMemoryCache.set(record.key, record);
                } else if (record?.key) {
                    obsolete.push(record.key);
                }
            });
            layoutCacheDiagnostics.cached = layoutMemoryCache.size;
            deleteCachedLayouts(layoutCacheDb, obsolete);
        } catch (error) {
            console.warn('Mushaf layout cache unavailable:', error);
            layoutCacheDb = null;
            layoutCacheDiagnostics.available = false;
        } finally {
            layoutCacheDiagnostics.hydrated = true;
            window.dispatchEvent(new CustomEvent('mushaf:layout-cache-ready', {
                detail: { cached: layoutMemoryCache.size }
            }));
        }
    }

    const layoutCacheReady = hydrateLayoutCache();

    function persistLayoutRecord(record) {
        layoutMemoryCache.set(record.key, record);
        layoutCacheDiagnostics.cached = layoutMemoryCache.size;
        layoutCacheReady.then(() => {
            if (!layoutCacheDb) return;
            try {
                const transaction = layoutCacheDb.transaction(LAYOUT_CACHE_STORE, 'readwrite');
                transaction.objectStore(LAYOUT_CACHE_STORE).put(record);
                transaction.oncomplete = () => { layoutCacheDiagnostics.writes++; };
            } catch (_) {
                // Memory caching still works if a device refuses persistent writes.
            }
        });
    }

    window.mushafLayoutCache = {
        version: LAYOUT_CACHE_VERSION,
        ready: layoutCacheReady,
        has(pageNumber, width = text.clientWidth, height = text.clientHeight) {
            if (!Number.isInteger(pageNumber) || pageNumber <= 2 || pageNumber > 604) return true;
            return layoutMemoryCache.has(layoutCacheKey(pageNumber, width, height));
        },
        count(width = text.clientWidth, height = text.clientHeight) {
            const suffix = `:${layoutProfile(width, height)}`;
            let count = 0;
            layoutMemoryCache.forEach((_, key) => {
                if (key.endsWith(suffix)) count++;
            });
            return count;
        },
        getProfile(width = text.clientWidth, height = text.clientHeight) {
            return layoutProfile(width, height);
        }
    };

    const layoutStyle = document.createElement('style');
    layoutStyle.textContent = `
        .quran-text:not(.opening-spread) {
            padding-inline: 10px;
        }
        .quran-text:not(.opening-spread) .surah-basmala {
            min-height: 1.45em;
            margin-block: .08em .18em;
            font-size: 1em;
            line-height: 1.42;
        }
        .quran-text:not(.opening-spread) .mushaf-line.is-full-line,
        .quran-text:not(.opening-spread) .mushaf-line.is-short-line,
        .quran-text:not(.opening-spread) .mushaf-line.is-crowded-line {
            justify-content: center;
        }
    `;
    document.head.appendChild(layoutStyle);

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function isIntentionalShortRow(container, line, pageNumber) {
        if (pageNumber <= 2) return false;
        const rows = Array.from(container.children);
        const index = rows.indexOf(line);
        if (rows[index + 1]?.classList?.contains('surah-heading')) return true;
        if (index === rows.length - 1) {
            if (pageNumber === 604) return true;
            const nextLayout = window.mushafReader?.getPageLayout?.(pageNumber + 1);
            return nextLayout?.[0]?.[0] === 'h';
        }
        return false;
    }

    function baseWordText(word) {
        if (!originalWordText.has(word)) originalWordText.set(word, word.textContent || '');
        return originalWordText.get(word) || '';
    }

    function restoreLineWords(line) {
        line.querySelectorAll('.mushaf-word').forEach(word => {
            const original = baseWordText(word);
            if (word.textContent !== original) word.textContent = original;
        });
    }

    function segmentWord(textValue) {
        if (graphemeSegmenter) {
            return Array.from(graphemeSegmenter.segment(textValue), item => item.segment);
        }
        return Array.from(textValue);
    }

    function arabicBaseLetter(grapheme) {
        for (const char of Array.from(grapheme)) {
            if (/^[\u0621-\u063A\u0641-\u064A\u0671]$/u.test(char)) return char;
        }
        return '';
    }

    function kashidaSlots(textValue) {
        const graphemes = segmentWord(textValue);
        const slots = [];
        for (let index = 0; index < graphemes.length - 1; index++) {
            const left = arabicBaseLetter(graphemes[index]);
            const right = arabicBaseLetter(graphemes[index + 1]);
            if (!left || !right || right === 'ء' || NON_JOINING_AFTER.has(left)) continue;
            if (graphemes[index].includes(KASHIDA) || graphemes[index + 1].includes(KASHIDA)) continue;
            slots.push(index);
        }
        return { graphemes, slots };
    }

    function renderExtendedWord(plan) {
        let textValue = '';
        plan.graphemes.forEach((grapheme, index) => {
            textValue += grapheme;
            const count = plan.counts.get(index) || 0;
            if (count) textValue += KASHIDA.repeat(count);
        });
        plan.word.textContent = textValue;
    }

    function createKashidaPlans(line) {
        return Array.from(line.querySelectorAll('.mushaf-word'))
            .map(word => {
                const original = baseWordText(word);
                const { graphemes, slots } = kashidaSlots(original);
                return { word, graphemes, slots, counts: new Map(), added: 0, cursor: 0 };
            })
            .filter(plan => plan.slots.length > 0);
    }

    function lineItemMetrics(line) {
        const items = Array.from(line.children);
        return {
            items,
            intrinsic: items.reduce((sum, item) => sum + item.getBoundingClientRect().width, 0),
            slots: Math.max(0, items.length - 1)
        };
    }

    function measureLineContent(line) {
        const boxes = Array.from(line.children).map(child => child.getBoundingClientRect());
        if (!boxes.length) return 0;
        return Math.max(...boxes.map(box => box.right)) - Math.min(...boxes.map(box => box.left));
    }

    function setBoundedGap(line, availableWidth, fontSize) {
        const { intrinsic, slots } = lineItemMetrics(line);
        if (!slots) {
            line.style.columnGap = '0px';
            return { intrinsic, slots, gap: 0 };
        }
        const minGap = fontSize * STANDARD_GAP_MIN_EM;
        const maxGap = fontSize * STANDARD_GAP_MAX_EM;
        const idealGap = (availableWidth - intrinsic) / slots;
        const gap = clamp(idealGap, minGap, maxGap);
        line.style.columnGap = `${gap.toFixed(2)}px`;
        return { intrinsic, slots, gap };
    }

    function extendLineWithKashidas(line, availableWidth, fontSize) {
        const plans = createKashidaPlans(line);
        if (!plans.length) return;
        const targetWidth = availableWidth * STANDARD_TARGET_FILL;
        let totalAdded = 0;
        let cursor = 0;
        let stalled = 0;

        while (totalAdded < MAX_KASHIDAS_PER_LINE && stalled < plans.length) {
            const currentWidth = measureLineContent(line);
            if (currentWidth >= targetWidth - fontSize * .025) break;

            const plan = plans[cursor % plans.length];
            cursor++;
            if (plan.added >= MAX_KASHIDAS_PER_WORD) {
                stalled++;
                continue;
            }

            const slot = plan.slots[plan.cursor % plan.slots.length];
            plan.cursor++;
            plan.counts.set(slot, (plan.counts.get(slot) || 0) + 1);
            plan.added++;
            renderExtendedWord(plan);

            if (measureLineContent(line) > availableWidth + fontSize * .08) {
                const nextCount = (plan.counts.get(slot) || 1) - 1;
                if (nextCount) plan.counts.set(slot, nextCount);
                else plan.counts.delete(slot);
                plan.added--;
                renderExtendedWord(plan);
                stalled++;
                continue;
            }

            totalAdded++;
            stalled = 0;
        }
    }

    function cachedLineState(line) {
        if (line.classList.contains('is-crowded-line')) return 'is-crowded-line';
        if (line.classList.contains('is-full-line')) return 'is-full-line';
        return 'is-short-line';
    }

    function snapshotStandardLayout(container, pageNumber, layoutWidth) {
        const width = Math.round(container.clientWidth);
        const height = Math.round(container.clientHeight);
        const lines = Array.from(container.querySelectorAll('.mushaf-line'));
        return {
            key: layoutCacheKey(pageNumber, width, height),
            version: LAYOUT_CACHE_VERSION,
            pageNumber,
            width,
            height,
            fontSize: parseFloat(container.style.fontSize) || parseFloat(getComputedStyle(container).fontSize),
            minRowHeight: container.style.getPropertyValue('--mushaf-min-row-height'),
            standardLayoutWidth: layoutWidth,
            lines: lines.map(line => ({
                start: line.dataset.start || '',
                end: line.dataset.end || '',
                role: line.dataset.lineRole || '',
                state: cachedLineState(line),
                transform: line.style.transform || '',
                columnGap: line.style.columnGap || '',
                words: Array.from(line.querySelectorAll('.mushaf-word'), word => word.textContent || '')
            }))
        };
    }

    function applyCachedStandardLayout(container, pageNumber, layoutWidth, cached) {
        if (!cached || cached.version !== LAYOUT_CACHE_VERSION ||
            cached.pageNumber !== pageNumber || !Number.isFinite(cached.fontSize)) return false;
        const lines = Array.from(container.querySelectorAll('.mushaf-line'));
        if (!Array.isArray(cached.lines) || cached.lines.length !== lines.length) return false;

        const wordLists = [];
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            const saved = cached.lines[index];
            const words = Array.from(line.querySelectorAll('.mushaf-word'));
            if (!saved || saved.start !== (line.dataset.start || '') ||
                saved.end !== (line.dataset.end || '') ||
                !Array.isArray(saved.words) || saved.words.length !== words.length) {
                return false;
            }
            wordLists.push(words);
        }

        applyAdaptiveRows(container);
        container.classList.remove('opening-spread');
        container.dataset.openingPage = '';
        const fontSize = `${cached.fontSize.toFixed(2)}px`;
        container.style.fontSize = fontSize;
        container.style.setProperty('--mushaf-font-size', fontSize);
        container.style.setProperty('--mushaf-min-row-height', cached.minRowHeight || '0px');

        lines.forEach((line, index) => {
            const saved = cached.lines[index];
            wordLists[index].forEach((word, wordIndex) => {
                baseWordText(word);
                const stretched = saved.words[wordIndex];
                if (word.textContent !== stretched) word.textContent = stretched;
            });
            line.style.transform = saved.transform || '';
            line.style.width = '';
            line.style.fontSize = '';
            line.style.justifyContent = 'center';
            line.style.columnGap = saved.columnGap || '';
            line.dataset.lineRole = saved.role || '';
            line.classList.remove('is-measuring', 'is-full-line', 'is-short-line', 'is-crowded-line');
            line.classList.add(saved.state || 'is-short-line');
        });
        container.dataset.layoutState = 'ready';
        container.dataset.standardLayoutPage = String(pageNumber);
        container.dataset.standardLayoutWidth = layoutWidth;
        layoutCacheDiagnostics.hits++;
        return true;
    }

    function stabilizeStandardPage(container, pageNumber) {
        if (!container || pageNumber <= 2 || !container.clientWidth || !container.clientHeight) return;
        // Height matters on tablets because the responsive type scale is capped by
        // the number of Quran rows that can fit vertically.
        const layoutWidth = `${container.clientWidth}x${container.clientHeight}`;
        if (container.dataset.standardLayoutPage === String(pageNumber) &&
            container.dataset.standardLayoutWidth === layoutWidth &&
            container.dataset.layoutState === 'ready') return;

        const key = layoutCacheKey(pageNumber, container.clientWidth, container.clientHeight);
        const cached = layoutMemoryCache.get(key);
        if (cached && applyCachedStandardLayout(container, pageNumber, layoutWidth, cached)) return;
        if (cached) {
            layoutMemoryCache.delete(key);
            layoutCacheDiagnostics.invalid++;
        }
        layoutCacheDiagnostics.misses++;
        layoutCacheDiagnostics.calculations++;

        applyAdaptiveRows(container);
        container.classList.remove('opening-spread');
        container.dataset.openingPage = '';

        const containerStyle = getComputedStyle(container);
        const horizontalPadding =
            (parseFloat(containerStyle.paddingLeft) || 0) +
            (parseFloat(containerStyle.paddingRight) || 0);
        const usableTextWidth = Math.max(1, container.clientWidth - horizontalPadding);
        const phoneFontSize = clamp(
            usableTextWidth * STANDARD_FONT_WIDTH_RATIO,
            STANDARD_FONT_MIN,
            STANDARD_FONT_MAX
        );
        const tabletIncrease = Math.max(
            0,
            usableTextWidth - TABLET_FONT_START_WIDTH
        ) * TABLET_FONT_GROWTH_PER_PX;
        const heightLimit = container.clientHeight > 0
            ? container.clientHeight * TABLET_FONT_HEIGHT_BUDGET /
                (TABLET_FONT_HEIGHT_ROWS * TABLET_FONT_HEIGHT_LINE_RATIO)
            : TABLET_FONT_MAX;
        let fontSize = tabletIncrease > 0
            ? clamp(
                Math.min(phoneFontSize + tabletIncrease, heightLimit),
                STANDARD_FONT_MIN,
                TABLET_FONT_MAX
            )
            : phoneFontSize;
        const lineHeight = parseFloat(getComputedStyle(container).lineHeight) /
            Math.max(1, parseFloat(getComputedStyle(container).fontSize)) || 1.42;
        const applyFontSize = () => {
            container.style.fontSize = `${fontSize.toFixed(2)}px`;
            container.style.setProperty('--mushaf-font-size', `${fontSize.toFixed(2)}px`);
            container.style.setProperty('--mushaf-min-row-height', `${(fontSize * lineHeight).toFixed(2)}px`);
        };
        applyFontSize();

        const lines = Array.from(container.querySelectorAll('.mushaf-line'));
        lines.forEach(line => {
            restoreLineWords(line);
            line.style.transform = '';
            line.style.width = '';
            line.style.fontSize = '';
            line.style.justifyContent = 'center';
            line.style.columnGap = '';
            line.dataset.lineRole = isIntentionalShortRow(container, line, pageNumber) ? 'surah-end' : '';
            line.classList.remove('is-measuring', 'is-full-line', 'is-short-line', 'is-crowded-line');
            const isFull = line.dataset.lineRole !== 'surah-end' && line.children.length >= 3;
            line.classList.add(isFull ? 'is-full-line' : 'is-short-line');
        });

        // Multiple full-width surah ornaments leave less vertical room on a
        // short phone. Fit only pages that would otherwise scroll past the
        // printed-page boundary; ordinary pages keep the width-based size.
        const hasRowOverflow = () => {
            const bounds = container.getBoundingClientRect();
            return Array.from(container.children).some(row => {
                const rect = row.getBoundingClientRect();
                return rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1;
            });
        };
        for (let pass = 0; pass < 2 && hasRowOverflow(); pass++) {
            const headingHeight = Array.from(container.querySelectorAll('.surah-heading'))
                .reduce((sum, heading) => sum + heading.getBoundingClientRect().height, 0);
            const scalableHeight = Math.max(1, container.scrollHeight - headingHeight);
            const availableScalableHeight = Math.max(1, container.clientHeight - headingHeight);
            const nextSize = clamp(
                fontSize * availableScalableHeight / scalableHeight * 0.995,
                STANDARD_FONT_MIN,
                fontSize
            );
            if (Math.abs(nextSize - fontSize) < 0.02) break;
            fontSize = nextSize;
            applyFontSize();
        }

        const availableWidth = Math.max(1, (lines[0]?.clientWidth || usableTextWidth) - 4);
        lines.forEach(line => {
            const shouldFill = line.dataset.lineRole !== 'surah-end' && line.children.length >= 3;
            setBoundedGap(line, availableWidth, fontSize);

            const beforeFill = measureLineContent(line);
            if (shouldFill && beforeFill < availableWidth * STANDARD_TARGET_FILL) {
                extendLineWithKashidas(line, availableWidth, fontSize);
                setBoundedGap(line, availableWidth, fontSize);
            }

            const contentWidth = measureLineContent(line);
            if (contentWidth <= availableWidth + 0.5) return;
            const scale = Math.max(
                STANDARD_LINE_MIN_SCALE,
                Math.min(1, availableWidth / Math.max(1, contentWidth) * 0.985)
            );
            line.style.transform = `scaleX(${scale.toFixed(4)})`;
            line.classList.remove('is-full-line', 'is-short-line');
            line.classList.add('is-crowded-line');
        });
        container.dataset.layoutState = 'ready';
        container.dataset.standardLayoutPage = String(pageNumber);
        container.dataset.standardLayoutWidth = layoutWidth;
        if (!document.fonts?.check || document.fonts.check('24px "Amiri Quran"')) {
            persistLayoutRecord(snapshotStandardLayout(container, pageNumber, layoutWidth));
        }
    }

    let originalFitElement = null;
    function installStandardFitOverride() {
        const reader = window.mushafReader;
        if (!reader?.fitElement || reader.fitElement.__standardLayoutWrapper) return;
        originalFitElement = reader.fitElement.bind(reader);
        const wrapped = (container, pageNumber) => {
            if (pageNumber <= 2) return originalFitElement(container, pageNumber);
            stabilizeStandardPage(container, pageNumber);
        };
        wrapped.__standardLayoutWrapper = true;
        reader.fitElement = wrapped;
    }

    function stabilizeVisiblePage() {
        installStandardFitOverride();
        const pageNumber = Math.max(1, Math.min(604, fromArabicDigits(displayPageNumber.textContent)));
        if (pageNumber > 2) stabilizeStandardPage(text, pageNumber);
    }

    function syncPageMeta() {
        applyAdaptiveRows(text);

        const surahs = pageSurahs(text);
        if (surahs.length) {
            const title = surahs.length === 1
                ? `سورة ${SURAH_NAMES[surahs[0] - 1]}`
                : surahs.map(number => SURAH_NAMES[number - 1]).join('، ');
            if (pageSurah) {
                pageSurah.textContent = title;
                pageSurah.title = title;
                pageSurah.style.flex = '1 1 auto';
                pageSurah.style.minWidth = '0';
            }
            if (toolbarSurah) toolbarSurah.textContent = title;
        }

        const pageNumber = Math.max(1, Math.min(604, fromArabicDigits(displayPageNumber.textContent)));
        const juzText = `الجزء ${toArabicDigits(getJuz(pageNumber))}`;
        if (pageRange) {
            pageRange.textContent = juzText;
            pageRange.style.flex = '0 0 auto';
            pageRange.style.marginInlineStart = '8px';
        }
        if (toolbarRange) toolbarRange.textContent = juzText;
    }

    let queued = false;
    function queueSync() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            stabilizeVisiblePage();
            syncPageMeta();
        });
    }

    new MutationObserver(queueSync).observe(text, { childList: true, subtree: false });

    // Swipe previews are cloned pages, so apply the same responsive row balance to them.
    new MutationObserver(records => {
        records.forEach(record => {
            record.addedNodes.forEach(node => {
                if (!(node instanceof HTMLElement) || !node.classList.contains('swipe-preview')) return;
                const previewText = node.querySelector('.quran-text');
                if (!previewText) return;
                applyAdaptiveRows(previewText);
                const previewNumber = fromArabicDigits(
                    node.querySelector('.display-page-number')?.textContent || ''
                );
                if (previewNumber > 2) stabilizeStandardPage(previewText, previewNumber);
            });
        });
    }).observe(stage, { childList: true });

    let deepLinkConsumed = false;
    let deepLinkHighlightTimer = null;

    function readVerseDeepLink() {
        const hash = window.location.hash.replace(/^#/, '');
        if (!hash) return null;
        const params = new URLSearchParams(hash);
        const match = params.get('verse')?.match(/^(\d{1,3}):(\d{1,3})$/);
        if (!match) return null;
        const surah = Number(match[1]);
        const ayah = Number(match[2]);
        if (!Number.isInteger(surah) || !Number.isInteger(ayah) ||
            surah < 1 || surah > 114 || ayah < 1) return null;
        return {
            surah,
            ayah,
            action: params.get('action') === 'tafsir' ? 'tafsir' : 'verse'
        };
    }

    function clearVerseDeepLink() {
        if (!window.location.hash) return;
        try {
            history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`);
        } catch (_) {
            // The navigation already succeeded, so leaving the hash is harmless.
        }
    }

    function highlightVerse(surah, ayah) {
        clearTimeout(deepLinkHighlightTimer);
        document.querySelectorAll('.mushaf-word.is-search-target').forEach(node =>
            node.classList.remove('is-search-target'));
        const key = `${surah}:${ayah}`;
        const words = Array.from(document.querySelectorAll('#quran-text .mushaf-word'))
            .filter(word => word.dataset.verse === key);
        words.forEach(word => word.classList.add('is-search-target'));
        words[0]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        deepLinkHighlightTimer = setTimeout(() => {
            words.forEach(word => word.classList.remove('is-search-target'));
        }, 5500);
    }

    function openTafsirWhenReady(verse, attempts = 0) {
        if (window.mushafTafsir?.open && window.QuranAudio?.VERSE_COUNTS) {
            window.mushafTafsir.open(verse);
            return;
        }
        if (attempts >= 30) return;
        requestAnimationFrame(() => openTafsirWhenReady(verse, attempts + 1));
    }

    function consumeVerseDeepLink() {
        if (deepLinkConsumed) return;
        const target = readVerseDeepLink();
        if (!target) return;
        const reader = window.mushafReader;
        if (!reader?.getVerse || !reader?.goToVerse) return;
        if (!reader.getVerse(target.surah, target.ayah)) return;
        if (!reader.goToVerse(target.surah, target.ayah)) return;

        deepLinkConsumed = true;
        clearVerseDeepLink();
        const verse = {
            surah: target.surah,
            ayah: target.ayah,
            verseKey: `${target.surah}:${target.ayah}`
        };
        requestAnimationFrame(() => {
            highlightVerse(target.surah, target.ayah);
            if (target.action === 'tafsir') {
                requestAnimationFrame(() => openTafsirWhenReady(verse));
            }
        });
    }

    window.addEventListener('mushaf:data-ready', () => {
        stabilizeVisiblePage();
        consumeVerseDeepLink();
    });
    window.addEventListener('mushaf:page-ready', stabilizeVisiblePage);
    window.addEventListener('resize', queueSync, { passive: true });

    // A cached fit measured with fallback glyphs is invalid once the Quran
    // webfont finishes loading. Refit the visible page in place instead of
    // requiring the reader to turn away and back to repair stretched lines.
    if (document.fonts?.ready) {
        document.fonts.ready.then(() => {
            const page = fromArabicDigits(displayPageNumber.textContent);
            if (page > 2 && text.dataset.layoutState === 'ready') {
                text.dataset.standardLayoutPage = '';
                const key = layoutCacheKey(page, text.clientWidth, text.clientHeight);
                layoutMemoryCache.delete(key);
            }
            queueSync();
        }).catch(() => {});
        document.fonts.addEventListener?.('loadingdone', () => {
            const page = fromArabicDigits(displayPageNumber.textContent);
            if (page > 2) {
                text.dataset.standardLayoutPage = '';
                layoutMemoryCache.delete(layoutCacheKey(page, text.clientWidth, text.clientHeight));
            }
            queueSync();
        });
    }

    // Load the idle pre-warmer after the cache API exists. It prepares nearby
    // pages first, then slowly fills the rest of the 604-page mushaf.
    if (!document.querySelector('script[data-mushaf-layout-prewarm]')) {
        const prewarmScript = document.createElement('script');
        prewarmScript.src = './mushaf-layout-prewarm-worker.js';
        prewarmScript.async = true;
        prewarmScript.dataset.mushafLayoutPrewarm = 'true';
        document.head.appendChild(prewarmScript);
    }

    queueSync();
    consumeVerseDeepLink();
})();
