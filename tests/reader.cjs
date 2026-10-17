// Optional browser smoke test.
// npm install --no-save playwright
// QURAN_BROWSER_PATH=/usr/bin/chromium node tests/reader.cjs
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');

(async () => {
    const server = http.createServer((request, response) => {
        const pathname = request.url.split('?')[0] === '/'
            ? '/index.html'
            : request.url.split('?')[0];
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
            : {})
    });

    try {
        const page = await browser.newPage({ reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const url = `http://127.0.0.1:${server.address().port}/quran.html`;
        const samples = [1, 2, 50, 77, 106, 207, 208, 223, 332, 446, 586, 587, 602, 604];
        let checks = 0;

        for (const [width, height] of [
            [320, 568], [390, 844], [430, 932], [768, 1024], [1024, 1366],
        ]) {
            await page.setViewportSize({ width, height });

            for (const pageNumber of samples) {
                await page.goto(url);
                await page.evaluate(number => {
                    localStorage.setItem(
                        'quranReaderState',
                        JSON.stringify({ displayPage: number }),
                    );
                }, pageNumber);
                await page.reload();
                await page.waitForSelector('#loading-screen', { state: 'detached' });
                await page.evaluate(() => document.fonts.ready);
                await page.waitForFunction(() => (
                    document.querySelector('#quran-text').dataset.layoutState === 'ready'
                ));

                const result = await page.evaluate(() => {
                    const text = document.querySelector('#quran-text');
                    const bounds = text.getBoundingClientRect();
                    const words = [...text.querySelectorAll('.mushaf-word')];
                    const rows = [...text.children].map(element => element.getBoundingClientRect());
                    const headings = [...text.querySelectorAll('.surah-heading')].map(heading => {
                        const rect = heading.getBoundingClientRect();
                        const titleElement = heading.querySelector('.surah-name');
                        const title = titleElement.getBoundingClientRect();
                        return {
                            ratio: rect.width / rect.height,
                            width: rect.width,
                            height: rect.height,
                            centerDeltaX: Math.abs(
                                (title.left + title.width / 2) - (rect.left + rect.width / 2),
                            ),
                            centerDeltaY: Math.abs(
                                (title.top + title.height / 2) - (rect.top + rect.height / 2),
                            ),
                            titleFits: titleElement.scrollWidth <= titleElement.clientWidth + 1,
                        };
                    });
                    return {
                        rows: text.children.length,
                        words: words.length,
                        markers: text.querySelectorAll('.ayah-marker').length,
                        outside: words.filter(word => {
                            const rect = word.getBoundingClientRect();
                            return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
                        }).length,
                        overflowX: getComputedStyle(text).overflowX,
                        verticalOverflow: text.scrollHeight - text.clientHeight,
                        outsideRowsVertical: rows.filter(rect => (
                            rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1
                        )).length,
                        rowOverlaps: rows.slice(1).filter((rect, index) => (
                            rows[index].bottom > rect.top + 1
                        )).length,
                        headings,
                    };
                });

                assert.ok(result.rows >= 8 && result.rows <= 16);
                assert.ok(result.words > 0 && result.markers > 0);
                assert.equal(result.outside, 0, `word outside page ${pageNumber} at ${width}x${height}`);
                assert.equal(result.overflowX, 'hidden');
                assert.equal(
                    result.outsideRowsVertical,
                    0,
                    `row outside page ${pageNumber} at ${width}x${height}`,
                );
                assert.equal(result.rowOverlaps, 0, `row overlap on page ${pageNumber} at ${width}x${height}`);
                for (const heading of result.headings) {
                    assert.ok(Math.abs(heading.ratio - (1000 / 224)) < 0.02);
                    assert.ok(heading.width > 0);
                    assert.ok(heading.centerDeltaX < 0.6);
                    // Quran glyphs sit below their line box, so the title uses
                    // a small, deliberate optical offset inside the cartouche.
                    assert.ok(heading.centerDeltaY / heading.height < 0.11);
                    assert.equal(heading.titleFits, true);
                }
                checks++;
            }
        }

        await page.evaluate(() => {
            localStorage.setItem('quranReaderState', JSON.stringify({ displayPage: 2 }));
        });
        await page.reload();
        await page.waitForSelector('#loading-screen', { state: 'detached' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => (
            document.querySelector('#quran-text').dataset.layoutState === 'ready'
        ));

        const readerGeometry = () => page.evaluate(() => {
            const snapshot = element => {
                const rect = element.getBoundingClientRect();
                return [rect.x, rect.y, rect.width, rect.height];
            };
            return {
                page: snapshot(document.querySelector('#mushaf-page')),
                rows: [...document.querySelector('#quran-text').children].map(snapshot),
            };
        });
        const beforeSettings = await readerGeometry();
        await page.evaluate(() => document.querySelector('#open-settings').click());
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await page.waitForTimeout(140);
        assert.deepEqual(await readerGeometry(), beforeSettings);
        assert.equal(await page.locator('#font-size-range').count(), 0);
        assert.equal(await page.locator('#line-height-range').count(), 0);
        await page.evaluate(() => document.querySelector('#close-settings').click());
        await page.waitForTimeout(230);
        assert.deepEqual(await readerGeometry(), beforeSettings);

        await page.evaluate(() => window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowLeft' }),
        ));
        assert.equal(
            await page.evaluate(() => JSON.parse(localStorage.quranReaderState).displayPage),
            3,
        );
        assert.deepEqual(errors, []);
        console.log(`PASS: ${checks} responsive page checks; stable settings overlay; navigation persistence; no page errors.`);
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
