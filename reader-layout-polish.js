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
                if (previewText) applyAdaptiveRows(previewText);
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
        if (window.mushafTafsir?.open) {
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

    window.addEventListener('mushaf:data-ready', consumeVerseDeepLink);
    window.addEventListener('resize', queueSync, { passive: true });
    queueSync();
    consumeVerseDeepLink();
})();