(() => {
    'use strict';

    const FAVORITES_KEY = 'quranVerseFavoritesV1';
    const MARKER_KEY = 'quranReadingMarkerV1';
    const PAGE_MARKER_KEY = 'quranPageMarkerV1';
    const $ = id => document.getElementById(id);
    const actions = {
        bookmark: document.querySelector('[data-verse-action="bookmark"]'),
        copy: document.querySelector('[data-verse-action="copy"]'),
        share: document.querySelector('[data-verse-action="share"]'),
        marker: document.querySelector('[data-verse-action="reading-marker"]')
    };
    const saved = {
        open: $('open-saved'), sheet: $('saved-sheet'), backdrop: $('saved-backdrop'),
        close: $('close-saved'), list: $('saved-list'),
        favoritesTab: $('saved-tab-favorites'), markerTab: $('saved-tab-marker'),
        pageTab: $('saved-tab-page')
    };
    const share = {
        sheet: $('share-sheet'), backdrop: $('share-backdrop'), close: $('close-share'),
        preview: $('share-preview'), message: $('share-message'),
        send: $('share-image'), download: $('download-image')
    };
    const pageMarkerButton = $('toggle-page-marker');
    const toastElement = $('verse-toast');
    if (Object.values(actions).some(value => !value) ||
        Object.values(saved).some(value => !value) ||
        Object.values(share).some(value => !value) || !toastElement || !pageMarkerButton) return;

    const DIGITS = '٠١٢٣٤٥٦٧٨٩';
    const reader = () => window.mushafReader;
    let savedTab = 'favorites';
    let favorites = readFavorites();
    let marker = readMarker();
    let pageMarker = readPageMarker();
    let activeShare = null;
    let shareRequestId = 0;
    let toastTimer = null;
    const closeTimers = new WeakMap();

    function digits(value) {
        return String(value).replace(/\d/g, d => DIGITS[Number(d)]);
    }

    function isVerse(value) {
        return value && Number.isInteger(value.surah) && value.surah >= 1 &&
            value.surah <= 114 && Number.isInteger(value.ayah) && value.ayah >= 1 &&
            value.ayah <= 286;
    }

    function readFavorites() {
        try {
            const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
            if (!Array.isArray(raw)) return [];
            return [...new Set(raw.filter(key => typeof key === 'string' &&
                /^\d{1,3}:\d{1,3}$/.test(key)))].slice(0, 6236);
        } catch (_) { return []; }
    }

    function readMarker() {
        try {
            const value = JSON.parse(localStorage.getItem(MARKER_KEY) || 'null');
            return isVerse(value) && Number.isInteger(value.page) &&
                value.page >= 1 && value.page <= 604
                ? { surah: value.surah, ayah: value.ayah, page: value.page } : null;
        } catch (_) { return null; }
    }

    function readPageMarker() {
        try {
            const page = JSON.parse(localStorage.getItem(PAGE_MARKER_KEY) || 'null');
            return Number.isInteger(page) && page >= 1 && page <= 604 ? page : null;
        } catch (_) { return null; }
    }

    function updatePageMarkerButton() {
        const page = reader()?.getCurrentPage();
        const isMarked = pageMarker !== null && pageMarker === page;
        pageMarkerButton.setAttribute('aria-pressed', String(isMarked));
        pageMarkerButton.setAttribute('aria-label', isMarked
            ? 'إزالة فاصلة الصفحة الحالية' : 'حفظ فاصلة للصفحة الحالية');
        pageMarkerButton.title = isMarked ? 'إزالة فاصلة الصفحة' : 'حفظ فاصلة الصفحة';
    }

    function togglePageMarker() {
        const page = reader()?.getCurrentPage();
        if (!Number.isInteger(page) || page < 1 || page > 604) {
            notify('انتظر حتى تكتمل الصفحة');
            return;
        }
        const next = pageMarker === page ? null : page;
        if (!persist(PAGE_MARKER_KEY, next)) return;
        pageMarker = next;
        updatePageMarkerButton();
        notify(next === null ? 'تمت إزالة فاصلة الصفحة' :
            `تم حفظ فاصلة للصفحة ${digits(page)} ✓`);
    }

    function persist(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Unable to save reading data:', error);
            notify('تعذّر حفظ البيانات على هذا الجهاز');
            return false;
        }
    }

    function notify(message) {
        toastElement.textContent = message;
        toastElement.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toastElement.hidden = true; }, 2400);
    }

    function reference(verse) {
        return `سورة ${reader()?.getSurahName(verse.surah) || digits(verse.surah)} • الآية ${digits(verse.ayah)}`;
    }

    function verseText(verse) {
        return reader()?.getVerse(verse.surah, verse.ayah)?.text || '';
    }

    function selectedVerse() {
        const verse = window.mushafVerseActions?.getSelectedVerse?.();
        return isVerse(verse) ? verse : null;
    }

    function updateBookmarkButton(verse) {
        const exists = favorites.includes(verse.verseKey);
        actions.bookmark.querySelector('span').textContent =
            exists ? 'إزالة من المفضلة' : 'إضافة للمفضلة';
        actions.bookmark.querySelector('small').textContent = exists ? '★' : '☆';
        const same = marker?.surah === verse.surah && marker?.ayah === verse.ayah;
        actions.marker.querySelector('span').textContent =
            same ? 'إزالة الفاصلة' : 'ضع فاصلة هنا';
        actions.marker.querySelector('small').textContent = same ? '✓' : '۞';
    }

    window.addEventListener('mushaf:verse-selected', event => {
        if (isVerse(event.detail)) updateBookmarkButton(event.detail);
    });

    function toggleFavorite(verse) {
        const index = favorites.indexOf(verse.verseKey);
        const next = [...favorites];
        if (index === -1) next.unshift(verse.verseKey);
        else next.splice(index, 1);
        if (!persist(FAVORITES_KEY, next)) return;
        favorites = next;
        updateBookmarkButton(verse);
        notify(index === -1 ? 'تمت إضافة الآية للمفضلة ★' : 'تمت إزالة الآية من المفضلة');
    }

    function toggleMarker(verse) {
        const same = marker?.surah === verse.surah && marker?.ayah === verse.ayah;
        const page = reader()?.findVersePage(verse.surah, verse.ayah) ||
            reader()?.getCurrentPage();
        const next = same ? null : { surah: verse.surah, ayah: verse.ayah, page };
        if (!persist(MARKER_KEY, next)) return;
        marker = next;
        updateBookmarkButton(verse);
        notify(same ? 'تمت إزالة الفاصلة' : 'تم حفظ مكان القراءة ✓');
    }

    function openSheet(sheet, backdrop) {
        clearTimeout(closeTimers.get(backdrop));
        backdrop.hidden = false;
        sheet.setAttribute('aria-hidden', 'false');
        sheet.classList.add('is-open');
        requestAnimationFrame(() => backdrop.classList.add('is-open'));
    }

    function closeSheet(sheet, backdrop) {
        if (!sheet.classList.contains('is-open')) return;
        sheet.classList.remove('is-open');
        sheet.setAttribute('aria-hidden', 'true');
        backdrop.classList.remove('is-open');
        const timer = setTimeout(() => { backdrop.hidden = true; }, 250);
        closeTimers.set(backdrop, timer);
    }

    function closeSaved() {
        closeSheet(saved.sheet, saved.backdrop);
        saved.open.focus({ preventScroll: true });
    }

    function openSaved(tab = 'favorites') {
        if (saved.sheet.classList.contains('is-open')) return;
        savedTab = tab;
        renderSaved();
        openSheet(saved.sheet, saved.backdrop);
        saved.close.focus({ preventScroll: true });
    }

    function makeButton(label, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', onClick);
        return button;
    }

    function createSavedItem(verse, isMarker = false) {
        const item = document.createElement('article');
        item.className = 'saved-item';
        const label = document.createElement('small');
        label.textContent = reference(verse) + (isMarker ? ` • صفحة ${digits(marker.page)}` : '');
        const text = document.createElement('p');
        text.textContent = verseText(verse);
        const controls = document.createElement('div');
        controls.className = 'saved-item-actions';
        controls.appendChild(makeButton('اذهب للآية', () => {
            closeSaved();
            const page = isMarker ? marker?.page : undefined;
            const ok = reader()?.goToVerse(verse.surah, verse.ayah, page);
            if (!ok) notify('تعذّر الانتقال إلى الآية');
        }));
        controls.appendChild(makeButton(isMarker ? 'إزالة الفاصلة' : 'إزالة من المفضلة', () => {
            if (isMarker) {
                if (!persist(MARKER_KEY, null)) return;
                marker = null;
            } else {
                const next = favorites.filter(key => key !== verse.verseKey);
                if (!persist(FAVORITES_KEY, next)) return;
                favorites = next;
            }
            renderSaved();
        }));
        item.append(label, text, controls);
        return item;
    }

    function renderSaved() {
        const isFavorites = savedTab === 'favorites';
        const isVerseMarker = savedTab === 'marker';
        const isPageMarker = savedTab === 'page';
        for (const [tab, active] of [
            [saved.favoritesTab, isFavorites],
            [saved.markerTab, isVerseMarker],
            [saved.pageTab, isPageMarker]
        ]) {
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', String(active));
        }
        const fragment = document.createDocumentFragment();
        if (isFavorites) {
            favorites.forEach(key => {
                const [surah, ayah] = key.split(':').map(Number);
                const verse = { surah, ayah, verseKey: key };
                if (isVerse(verse) && verseText(verse)) fragment.appendChild(createSavedItem(verse));
            });
        } else if (isVerseMarker && marker) {
            const verse = { ...marker, verseKey: `${marker.surah}:${marker.ayah}` };
            fragment.appendChild(createSavedItem(verse, true));
        } else if (isPageMarker && pageMarker !== null) {
            const item = document.createElement('article');
            item.className = 'saved-item';
            const label = document.createElement('small');
            label.textContent = `فاصلة الصفحة ${digits(pageMarker)}`;
            const description = document.createElement('p');
            description.textContent = 'ارجع إلى الصفحة المحفوظة واستكمل القراءة من مكانك.';
            description.style.fontFamily = 'inherit';
            description.style.fontSize = '15px';
            const controls = document.createElement('div');
            controls.className = 'saved-item-actions';
            controls.appendChild(makeButton('اذهب للصفحة', () => {
                const page = pageMarker;
                closeSaved();
                if (!reader()?.goToPage(page)) notify('تعذّر الانتقال إلى الصفحة');
            }));
            controls.appendChild(makeButton('إزالة الفاصلة', () => {
                if (!persist(PAGE_MARKER_KEY, null)) return;
                pageMarker = null;
                updatePageMarkerButton();
                renderSaved();
            }));
            item.append(label, description, controls);
            fragment.appendChild(item);
        }
        if (!fragment.childNodes.length) {
            const empty = document.createElement('p');
            empty.className = 'saved-empty';
            empty.textContent = isFavorites
                ? 'لسه مفيش آيات في المفضلة. اضغط مطولًا على آية وأضفها هنا.'
                : isVerseMarker
                    ? 'لسه محطتش فاصلة. اختار آية واضغط «ضع فاصلة هنا».'
                    : 'لسه محطتش فاصلة صفحة. اضغط علامة الفاصلة جنب الإعدادات.';
            fragment.appendChild(empty);
        }
        saved.list.replaceChildren(fragment);
        saved.list.scrollTop = 0;
    }

    async function copyVerse(verse) {
        const text = verseText(verse);
        if (!text) { notify('نص الآية غير متاح'); return; }
        const value = `${text} ﴿${digits(verse.ayah)}﴾\n${reference(verse)}`;
        try {
            if (navigator.clipboard?.writeText && window.isSecureContext) {
                await navigator.clipboard.writeText(value);
            } else {
                const input = document.createElement('textarea');
                input.value = value;
                input.setAttribute('readonly', '');
                input.style.cssText = 'position:fixed;left:-9999px;top:0;';
                document.body.appendChild(input);
                input.select();
                const ok = document.execCommand('copy');
                input.remove();
                if (!ok) throw new Error('Clipboard fallback unavailable');
            }
            notify('تم نسخ الآية ✓');
            window.mushafVerseActions?.close();
        } catch (error) {
            console.error('Verse copy failed:', error);
            notify('النسخ غير متاح في هذا المتصفح');
        }
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
        }
        ctx.closePath();
    }

    function wrapLines(ctx, text, maxWidth) {
        const lines = [];
        let line = '';
        for (const word of text.split(/\s+/).filter(Boolean)) {
            const next = line ? line + ' ' + word : word;
            if (ctx.measureText(next).width > maxWidth && line) {
                lines.push(line);
                line = word;
            } else line = next;
        }
        if (line) lines.push(line);
        return lines;
    }

    function fitText(ctx, text, width, maxLines) {
        for (let size = 60; size >= 29; size -= 2) {
            ctx.font = `${size}px "Amiri Quran", serif`;
            const lines = wrapLines(ctx, text, width);
            if (lines.length <= maxLines) return { size, lines };
        }
        ctx.font = '29px "Amiri Quran", serif';
        return { size: 29, lines: wrapLines(ctx, text, width) };
    }

    function buildImage(verse) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas is unavailable');
        const text = verseText(verse);
        if (!text) throw new Error('Verse text unavailable');
        const width = 840;
        const fitted = fitText(ctx, text, width, 14);
        const lineHeight = fitted.size * 1.9;
        const contentHeight = Math.max(440, fitted.lines.length * lineHeight + 80);
        canvas.height = Math.ceil(230 + contentHeight + 260);
        const h = canvas.height;

        const gradient = ctx.createLinearGradient(0, 0, 1080, h);
        gradient.addColorStop(0, '#fdfbf2');
        gradient.addColorStop(1, '#e6f1e6');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1080, h);
        ctx.strokeStyle = 'rgba(22,104,88,.28)';
        ctx.lineWidth = 3;
        roundRect(ctx, 48, 48, 984, h - 96, 35);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(22,104,88,.16)';
        ctx.lineWidth = 2;
        roundRect(ctx, 64, 64, 952, h - 128, 26);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.direction = 'rtl';
        ctx.fillStyle = '#176b63';
        ctx.font = '36px serif';
        ctx.fillText('۞', 540, 116);
        ctx.font = 'bold 31px Tahoma, Arial, sans-serif';
        ctx.fillText('آيَةٌ مِنَ الْقُرْآنِ الْكَرِيمِ', 540, 173);
        ctx.strokeStyle = '#b8cdbf';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(370, 207);
        ctx.lineTo(710, 207);
        ctx.stroke();

        ctx.fillStyle = '#203a30';
        ctx.font = `${fitted.size}px "Amiri Quran", serif`;
        const yStart = 230 + (contentHeight - fitted.lines.length * lineHeight) / 2 + lineHeight / 2;
        fitted.lines.forEach((line, i) => {
            ctx.fillText(line, 540, yStart + i * lineHeight);
        });
        const footer = 230 + contentHeight + 92;
        ctx.fillStyle = '#176b63';
        ctx.font = 'bold 32px Tahoma, Arial, sans-serif';
        ctx.fillText(reference(verse).replace(' • ', '  |  '), 540, footer);
        ctx.fillStyle = '#758e7d';
        ctx.font = '23px Tahoma, Arial, sans-serif';
        ctx.fillText('القرآن الكريم', 540, footer + 55);
        return canvas;
    }

    function canvasBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png');
        });
    }

    function closeShare() {
        ++shareRequestId;
        closeSheet(share.sheet, share.backdrop);
        if (activeShare?.url) URL.revokeObjectURL(activeShare.url);
        activeShare = null;
        share.preview.removeAttribute('src');
    }

    async function openShare(verse) {
        window.mushafVerseActions?.close();
        const requestId = ++shareRequestId;
        if (activeShare?.url) URL.revokeObjectURL(activeShare.url);
        activeShare = null;
        share.preview.removeAttribute('src');
        share.message.textContent = 'جاري تصميم بطاقة الآية…';
        share.send.disabled = true;
        share.download.disabled = true;
        openSheet(share.sheet, share.backdrop);
        share.close.focus({ preventScroll: true });
        try {
            if (document.fonts?.load) await document.fonts.load('42px "Amiri Quran"');
            if (requestId !== shareRequestId || !share.sheet.classList.contains('is-open')) return;
            const canvas = buildImage(verse);
            const blob = await canvasBlob(canvas);
            if (requestId !== shareRequestId || !share.sheet.classList.contains('is-open')) return;
            const url = URL.createObjectURL(blob);
            activeShare = { blob, url, filename: `quran-${verse.surah}-${verse.ayah}.png`, verse };
            share.preview.src = url;
            share.message.textContent = 'جاهزة للمشاركة أو الحفظ ✨';
            share.send.disabled = false;
            share.download.disabled = false;
        } catch (error) {
            console.error('Unable to create verse image:', error);
            share.message.textContent = 'تعذّر إنشاء الصورة على هذا الجهاز.';
        }
    }

    function downloadImage() {
        if (!activeShare) return;
        const link = document.createElement('a');
        link.href = activeShare.url;
        link.download = activeShare.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        notify('تم تجهيز الصورة للحفظ');
    }

    async function shareImage() {
        if (!activeShare) return;
        const file = new File([activeShare.blob], activeShare.filename, { type: 'image/png' });
        try {
            if (navigator.share && navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: reference(activeShare.verse) });
            } else {
                share.message.textContent = 'المشاركة المباشرة غير مدعومة هنا. استخدم «حفظ الصورة» وشاركها من المعرض.';
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Image share failed:', error);
                share.message.textContent = 'تعذّرت المشاركة. يمكنك حفظ الصورة ومشاركتها من المعرض.';
            }
        }
    }

    actions.bookmark.addEventListener('click', () => {
        const verse = selectedVerse();
        if (verse) toggleFavorite(verse);
    });
    actions.marker.addEventListener('click', () => {
        const verse = selectedVerse();
        if (verse) toggleMarker(verse);
    });
    actions.copy.addEventListener('click', () => {
        const verse = selectedVerse();
        if (verse) copyVerse(verse);
    });
    actions.share.addEventListener('click', () => {
        const verse = selectedVerse();
        if (verse) openShare(verse);
    });
    pageMarkerButton.addEventListener('click', togglePageMarker);
    window.addEventListener('mushaf:page-changed', updatePageMarkerButton);
    updatePageMarkerButton();
    saved.open.addEventListener('click', () => {
        document.getElementById('close-settings')?.click();
        openSaved();
    });
    saved.close.addEventListener('click', closeSaved);
    saved.backdrop.addEventListener('click', closeSaved);
    saved.favoritesTab.addEventListener('click', () => { savedTab = 'favorites'; renderSaved(); });
    saved.markerTab.addEventListener('click', () => { savedTab = 'marker'; renderSaved(); });
    saved.pageTab.addEventListener('click', () => { savedTab = 'page'; renderSaved(); });
    share.close.addEventListener('click', closeShare);
    share.backdrop.addEventListener('click', closeShare);
    share.download.addEventListener('click', downloadImage);
    share.send.addEventListener('click', shareImage);
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (share.sheet.classList.contains('is-open')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeShare();
        } else if (saved.sheet.classList.contains('is-open')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeSaved();
        }
    }, true);
    window.addEventListener('pagehide', () => {
        if (activeShare?.url) URL.revokeObjectURL(activeShare.url);
    });
})();
