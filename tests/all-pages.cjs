'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const allSizes = [[320, 568], [390, 844], [430, 932], [768, 1024], [1024, 1366]];
const sizes = process.env.QURAN_VIEWPORT
    ? allSizes.filter(size => size.join('x') === process.env.QURAN_VIEWPORT)
    : allSizes;
const pageLimit = Number(process.env.QURAN_PAGE_LIMIT || 604);
const surahNames = [
    'الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس',
    'هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه','الأنبياء','الحج',
    'المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم','لقمان','السجدة',
    'الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر','فصلت','الشورى','الزخرف','الدخان',
    'الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق','الذاريات','الطور','النجم','القمر','الرحمن',
    'الواقعة','الحديد','المجادلة','الحشر','الممتحنة','الصف','الجمعة','المنافقون','التغابن','الطلاق',
    'التحريم','الملك','القلم','الحاقة','المعارج','نوح','الجن','المزمل','المدثر','القيامة','الإنسان',
    'المرسلات','النبأ','النازعات','عبس','التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق',
    'الأعلى','الغاشية','الفجر','البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر',
    'البينة','الزلزلة','العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون',
    'الكوثر','الكافرون','النصر','المسد','الإخلاص','الفلق','الناس',
];

(async () => {
    const server = http.createServer((request, response) => {
        const pathname = request.url.split('?')[0] === '/' ? '/index.html' : request.url.split('?')[0];
        const filename = path.join(root, pathname);
        try {
            response.end(fs.readFileSync(filename));
        } catch (_) {
            response.statusCode = 404;
            response.end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({
        headless: true,
        ...(process.env.QURAN_BROWSER_PATH || fs.existsSync('/usr/bin/chromium')
            ? { executablePath: process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium' }
            : {}),
    });

    try {
        assert.equal(surahNames.length, 114);
        const page = await browser.newPage({ reducedMotion: 'reduce' });
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        const url = `http://127.0.0.1:${server.address().port}/quran.html`;
        let checkedPages = 0;

        for (const [width, height] of sizes) {
            await page.setViewportSize({ width, height });
            await page.goto(url);
            await page.evaluate(() => localStorage.setItem(
                'quranReaderState',
                JSON.stringify({ displayPage: 1 }),
            ));
            await page.reload();
            await page.waitForSelector('#loading-screen', { state: 'detached' });
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(220);

            const result = await page.evaluate(async ({ expectedNames, pageLimit }) => {
                const errors = [];
                const headings = [];
                let basmalas = 0;
                let standardFontSize = null;

                const waitForLayout = async expectedPage => {
                    const deadline = performance.now() + 3000;
                    while (
                        document.querySelector('#quran-text').dataset.layoutState !== 'ready' ||
                        JSON.parse(localStorage.quranReaderState).displayPage !== expectedPage
                    ) {
                        if (performance.now() > deadline) {
                            throw new Error(`layout did not settle on page ${expectedPage}`);
                        }
                        await new Promise(resolve => setTimeout(resolve, 20));
                    }
                };

                const fail = (pageNumber, message) => {
                    if (errors.length < 100) errors.push(`page ${pageNumber}: ${message}`);
                };

                for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
                    await waitForLayout(pageNumber);
                    const text = document.querySelector('#quran-text');
                    const textRect = text.getBoundingClientRect();
                    const rows = [...text.children];
                    const rowRects = rows.map(row => row.getBoundingClientRect());
                    const words = [...text.querySelectorAll('.mushaf-word')];

                    if (words.some(word => {
                        const rect = word.getBoundingClientRect();
                        return rect.left < textRect.left - 1 || rect.right > textRect.right + 1;
                    })) {
                        fail(pageNumber, 'word outside horizontal bounds');
                    }
                    if (rowRects.some(rect => (
                        rect.top < textRect.top - 1 || rect.bottom > textRect.bottom + 1
                    ))) {
                        fail(pageNumber, 'row outside vertical bounds');
                    }
                    if (rowRects.slice(1).some((rect, index) => rowRects[index].bottom > rect.top + 1)) {
                        fail(pageNumber, 'adjacent rows overlap');
                    }

                    if (pageNumber >= 3) {
                        const currentFontSize = parseFloat(getComputedStyle(text).fontSize);
                        if (standardFontSize === null) standardFontSize = currentFontSize;
                        const denseHeadingPage = text.querySelectorAll('.surah-heading').length >= 2;
                        if (Math.abs(currentFontSize - standardFontSize) > 0.05 &&
                            (!denseHeadingPage || currentFontSize < standardFontSize * 0.88 || currentFontSize > standardFontSize)) {
                            fail(pageNumber, `standard font size drift: ${currentFontSize} vs ${standardFontSize}`);
                        }
                        for (const basmala of text.querySelectorAll('.surah-basmala')) {
                            const basmalaSize = parseFloat(getComputedStyle(basmala).fontSize);
                            if (Math.abs(basmalaSize - currentFontSize) > 0.1) {
                                fail(pageNumber, `basmala size mismatch: ${basmalaSize} vs ${currentFontSize}`);
                                break;
                            }
                        }
                    }

                    const pageHeadings = [...text.querySelectorAll('.surah-heading')];
                    basmalas += text.querySelectorAll('.surah-basmala').length;
                    if (pageNumber === 207 && pageHeadings.length) {
                        fail(pageNumber, 'unexpected heading before Surah Yunus');
                    }

                    for (const heading of pageHeadings) {
                        const surah = Number(heading.dataset.surah);
                        const title = heading.querySelector('.surah-name');
                        const ornament = heading.querySelector('.surah-ornament');
                        const rect = heading.getBoundingClientRect();
                        const titleRect = title.getBoundingClientRect();
                        const ornamentRect = ornament.getBoundingClientRect();
                        const titleRange = document.createRange();
                        titleRange.selectNodeContents(title);
                        const glyphRect = titleRange.getBoundingClientRect();
                        headings.push({ surah, title: title.textContent, page: pageNumber });

                        if (title.textContent !== `سورة ${expectedNames[surah - 1]}`) {
                            fail(pageNumber, `wrong title for surah ${surah}: ${title.textContent}`);
                        }
                        if (Math.abs(rect.width / rect.height - (1000 / 224)) >= 0.02) {
                            fail(pageNumber, `distorted heading ratio for surah ${surah}`);
                        }
                        if (Math.abs((titleRect.left + titleRect.width / 2) - (rect.left + rect.width / 2)) >= 0.6 ||
                            Math.abs((titleRect.top + titleRect.height / 2) - (rect.top + rect.height / 2)) / rect.height >= 0.11) {
                            fail(pageNumber, `off-center title for surah ${surah}`);
                        }
                        if (glyphRect.left < rect.left + rect.width * 0.23 - 1 ||
                            glyphRect.right > rect.right - rect.width * 0.23 + 1 ||
                            glyphRect.top < rect.top - 1 || glyphRect.bottom > rect.bottom + 1 ||
                            title.scrollWidth > title.clientWidth + 1) {
                            fail(pageNumber, `clipped title for surah ${surah}`);
                        }
                        if (Math.abs(ornamentRect.width - rect.width) >= 0.6 ||
                            Math.abs(ornamentRect.height - rect.height) >= 0.6) {
                            fail(pageNumber, `ornament does not fill heading for surah ${surah}`);
                        }
                        if (ornament.getAttribute('preserveAspectRatio') === 'none') {
                            fail(pageNumber, `distorted ornament for surah ${surah}`);
                        }
                    }

                    if (pageNumber === 208 && !pageHeadings.some(item => item.dataset.surah === '10')) {
                        fail(pageNumber, 'Surah Yunus heading is missing');
                    }
                    if (pageNumber < pageLimit) {
                        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
                    }
                }

                return { errors, headings, basmalas };
            }, { expectedNames: surahNames, pageLimit });

            assert.deepEqual(result.errors, [], `${width}x${height} visual audit`);
            if (pageLimit === 604) {
                assert.equal(result.headings.length, 114, `${width}x${height} heading count`);
                assert.equal(new Set(result.headings.map(item => item.surah)).size, 114);
                assert.equal(result.basmalas, 112, `${width}x${height} basmala count`);
            }
            checkedPages += pageLimit;
        }

        assert.deepEqual(pageErrors, []);
        console.log(
            `PASS: ${checkedPages} rendered page/viewport checks; ` +
            `${pageLimit} pages at each of ${sizes.length} sizes` +
            (pageLimit === 604 ? '; 114 centered headings and 112 basmalas per size.' : '.'),
        );
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
